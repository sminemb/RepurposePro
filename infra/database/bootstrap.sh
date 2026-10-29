#!/bin/bash
set -euo pipefail
umask 077

# No credentials are present in user data or cloud-init output.
test "${DB_REGION}" = ap-southeast-1
test "${DB_HOSTNAME}" = db.re-purpose.pro
install -d -m 700 /var/lib/repurposepro-database
if test -e /var/lib/repurposepro-database/bootstrap-complete; then exit 0; fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y ca-certificates curl gnupg postgresql-common openssl python3-boto3 certbot
# Prevent package installation from creating a database on the disposable root disk.
install -d /etc/postgresql-common
install -d /usr/share/postgresql-common/pgdg
printf 'create_main_cluster = false\n' > /etc/postgresql-common/createcluster.conf
curl --fail --silent --show-error https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
printf 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main\n' \
  > /etc/apt/sources.list.d/pgdg.list
apt-get update -qq
apt-get install -y postgresql-17 postgresql-client-17 pgbackrest

serial="${DB_VOLUME_ID//-/}"
device="/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_${serial}"
for attempt in $(seq 1 120); do
  if test -b "$device"; then break; fi
  sleep 5
done
test -b "$device"
filesystem=$(blkid -s TYPE -o value "$device" || true)
if test -z "$filesystem"; then
  # A volume with an unknown signature must never be formatted automatically.
  test -z "$(wipefs --no-act --noheadings --output TYPE "$device")"
  mkfs.ext4 -L repurposepro-pg "$device"
elif test "$filesystem" != ext4; then
  echo 'Unexpected database filesystem; manual recovery required.' >&2
  exit 1
fi
install -d -m 755 /srv/postgresql
volume_uuid=$(blkid -s UUID -o value "$device")
if ! grep -q "UUID=${volume_uuid} " /etc/fstab; then
  printf 'UUID=%s /srv/postgresql ext4 defaults 0 2\n' "$volume_uuid" >> /etc/fstab
fi
mountpoint -q /srv/postgresql || mount /srv/postgresql
if test -e /srv/postgresql/17/main/PG_VERSION; then
  # Replacements do not create fresh empty clusters over retained production data.
  echo 'Existing PostgreSQL data found; use the documented recovery procedure.' >&2
  exit 1
fi
chown postgres:postgres /srv/postgresql
pg_createcluster 17 main --datadir /srv/postgresql/17/main --start-conf=auto

install -d -m 750 -o postgres -g postgres /etc/pgbackrest /var/log/pgbackrest
cat > /etc/pgbackrest/pgbackrest.conf <<EOF
[global]
repo1-type=s3
repo1-path=/production
repo1-s3-bucket=${DB_BACKUP_BUCKET}
repo1-s3-endpoint=s3.${DB_REGION}.amazonaws.com
repo1-s3-region=${DB_REGION}
repo1-s3-key-type=auto
repo1-retention-full=2
repo1-bundle=y
compress-type=zst
process-max=1
start-fast=y
log-level-console=warn

[production]
pg1-path=/srv/postgresql/17/main
EOF
chown postgres:postgres /etc/pgbackrest/pgbackrest.conf
chmod 640 /etc/pgbackrest/pgbackrest.conf
install -d -m 755 /etc/postgresql/17/main/conf.d
# PGDG/postgresql-common versions differ in whether they create/enable conf.d.
if ! grep -Eq "^[[:space:]]*include_dir[[:space:]]*=[[:space:]]*'conf.d'" /etc/postgresql/17/main/postgresql.conf; then
  printf "\ninclude_dir = 'conf.d'\n" >> /etc/postgresql/17/main/postgresql.conf
fi
cat > /etc/postgresql/17/main/conf.d/production.conf <<'EOF'
listen_addresses = 'localhost'
password_encryption = 'scram-sha-256'
max_connections = 60
shared_buffers = '256MB'
work_mem = '4MB'
maintenance_work_mem = '64MB'
idle_in_transaction_session_timeout = '60s'
log_statement = 'none'
log_min_error_statement = 'panic'
archive_mode = on
archive_timeout = 300
archive_command = 'pgbackrest --stanza=production archive-push %p'
EOF
cat > /etc/postgresql/17/main/pg_hba.conf <<'EOF'
local all postgres peer
local all all reject
host all all 0.0.0.0/0 reject
host all all ::/0 reject
EOF
chown root:postgres /etc/postgresql/17/main/conf.d/production.conf /etc/postgresql/17/main/pg_hba.conf
chmod 640 /etc/postgresql/17/main/conf.d/production.conf /etc/postgresql/17/main/pg_hba.conf
systemctl enable --now postgresql@17-main
runuser -u postgres -- pgbackrest --stanza=production stanza-create
runuser -u postgres -- pgbackrest --stanza=production check

install -m 755 /opt/repurposepro-database/configure-tls.sh /usr/local/sbin/repurposepro-database-tls
install -m 755 /opt/repurposepro-database/monitor.py /usr/local/sbin/repurposepro-database-monitor
install -m 755 /opt/repurposepro-database/backup.sh /usr/local/sbin/repurposepro-database-backup
install -m 755 /opt/repurposepro-database/restore-drill.sh /usr/local/sbin/repurposepro-database-restore-drill
printf 'DB_REGION=%s\nDB_HOSTNAME=%s\nDB_BACKUP_BUCKET=%s\n' "$DB_REGION" "$DB_HOSTNAME" "$DB_BACKUP_BUCKET" \
  > /etc/repurposepro-database.conf
chmod 644 /etc/repurposepro-database.conf

cat > /etc/systemd/system/repurposepro-database-monitor.service <<'EOF'
[Unit]
Description=Check production PostgreSQL and publish backup health
After=postgresql@17-main.service
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/repurposepro-database-monitor
TimeoutStartSec=45
EOF
cat > /etc/systemd/system/repurposepro-database-monitor.timer <<'EOF'
[Unit]
Description=Production PostgreSQL health every minute
[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
[Install]
WantedBy=timers.target
EOF
for kind in full diff; do
  if test "$kind" = full; then calendar='Sun *-*-* 18:00:00 UTC'; else calendar='Mon..Sat *-*-* 18:00:00 UTC'; fi
  cat > "/etc/systemd/system/repurposepro-database-${kind}.service" <<EOF
[Unit]
Description=Production PostgreSQL ${kind} backup
After=postgresql@17-main.service
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/repurposepro-database-backup ${kind}
TimeoutStartSec=2h
EOF
  cat > "/etc/systemd/system/repurposepro-database-${kind}.timer" <<EOF
[Unit]
Description=Scheduled production PostgreSQL ${kind} backup
[Timer]
OnCalendar=${calendar}
Persistent=true
[Install]
WantedBy=timers.target
EOF
done
systemctl daemon-reload
systemctl enable --now repurposepro-database-monitor.timer repurposepro-database-full.timer repurposepro-database-diff.timer
touch /var/lib/repurposepro-database/bootstrap-complete
echo 'Database bootstrap complete. TLS, restore rehearsal and cutover checks are still required.'
