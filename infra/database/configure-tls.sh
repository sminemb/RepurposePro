#!/bin/bash
set -euo pipefail
umask 077
source /etc/repurposepro-database.conf
test "$DB_HOSTNAME" = db.re-purpose.pro
install -d -m 750 -o root -g postgres /etc/postgresql/17/main/tls
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/repurposepro-postgres <<'EOF'
#!/bin/bash
set -euo pipefail
test "$RENEWED_LINEAGE" = /etc/letsencrypt/live/db.re-purpose.pro
install -m 640 -o root -g postgres "$RENEWED_LINEAGE/fullchain.pem" /etc/postgresql/17/main/tls/fullchain.pem
install -m 640 -o root -g postgres "$RENEWED_LINEAGE/privkey.pem" /etc/postgresql/17/main/tls/privkey.pem
if systemctl is-active --quiet postgresql@17-main; then
  systemctl reload postgresql@17-main
fi
EOF
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/repurposepro-postgres
certbot certonly --standalone --non-interactive --agree-tos --register-unsafely-without-email \
  --keep-until-expiring -d "$DB_HOSTNAME"
RENEWED_LINEAGE=/etc/letsencrypt/live/db.re-purpose.pro \
  /etc/letsencrypt/renewal-hooks/deploy/repurposepro-postgres
cat > /etc/postgresql/17/main/conf.d/tls.conf <<'EOF'
listen_addresses = '*'
ssl = on
ssl_min_protocol_version = 'TLSv1.2'
ssl_cert_file = '/etc/postgresql/17/main/tls/fullchain.pem'
ssl_key_file = '/etc/postgresql/17/main/tls/privkey.pem'
EOF
cat > /etc/postgresql/17/main/pg_hba.conf <<'EOF'
local all postgres peer
local all all reject
hostnossl all all 0.0.0.0/0 reject
hostnossl all all ::/0 reject
hostssl repurposepro,repurposepro_rehearsal repurposepro_owner,repurposepro_checkout,repurposepro_webhook,repurposepro_processing,repurposepro_admin 127.0.0.1/32 scram-sha-256
hostssl repurposepro,repurposepro_rehearsal repurposepro_owner,repurposepro_checkout,repurposepro_webhook,repurposepro_processing,repurposepro_admin 172.31.0.0/16 scram-sha-256
hostssl repurposepro repurposepro_runtime 0.0.0.0/0 scram-sha-256
host all all 0.0.0.0/0 reject
host all all ::/0 reject
EOF
chown root:postgres /etc/postgresql/17/main/conf.d/tls.conf /etc/postgresql/17/main/pg_hba.conf
chmod 640 /etc/postgresql/17/main/conf.d/tls.conf /etc/postgresql/17/main/pg_hba.conf
systemctl restart postgresql@17-main
systemctl enable --now certbot.timer
touch /var/lib/repurposepro-database/tls-ready
echo 'Trusted PostgreSQL TLS enabled; production connections have not been switched.'
