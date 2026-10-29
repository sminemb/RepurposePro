#!/bin/bash
# Run as root through SSM. Exercises WAL recovery on the same host using only a
# private Unix socket. The live cluster stays running and application tables are untouched.
set -euo pipefail
umask 077
test "$(id -u)" -eq 0
test -f /var/lib/repurposepro-database/bootstrap-complete
export PATH=/usr/lib/postgresql/17/bin:/usr/sbin:/usr/bin:/sbin:/bin
exec 9>/var/lib/repurposepro-database/backup.lock
flock --nonblock 9 || { echo 'Another backup or recovery drill is running.' >&2; exit 1; }

token=$(cat /proc/sys/kernel/random/uuid)
[[ "$token" =~ ^[a-f0-9-]{36}$ ]]
work="/srv/postgresql/restore-drill-${token}"
install -d -m 700 -o postgres -g postgres "$work" "$work/socket"
cleanup() {
  if test -f "$work/data/postmaster.pid"; then
    runuser -u postgres -- pg_ctl -D "$work/data" -m fast -w stop >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
live_size=$(du -sb /srv/postgresql/17/main | cut -f1)
free=$(df -B1 --output=avail /srv/postgresql | tail -1)
test "$free" -gt "$((live_size * 2 + 536870912))" || { echo 'Insufficient disk for an isolated restore drill.' >&2; exit 1; }
psql_local() { runuser -u postgres -- psql -XAtq -v ON_ERROR_STOP=1 -d postgres "$@"; }
psql_local -c 'CREATE TABLE IF NOT EXISTS public.repurposepro_recovery_probe(id text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT clock_timestamp())'
runuser -u postgres -- pgbackrest --stanza=production --type=full backup > "$work/backup.log" 2>&1
backup_set=$(runuser -u postgres -- pgbackrest --stanza=production --output=json info | \
  python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["backup"][-1]["label"])')
psql_local -c "INSERT INTO public.repurposepro_recovery_probe(id) VALUES ('${token}-before')"
target=$(psql_local -c 'SELECT clock_timestamp()::text')
# Force and wait for the WAL containing the committed marker.
runuser -u postgres -- pgbackrest --stanza=production check > "$work/archive-before.log" 2>&1
archive_delay=$(psql_local -c "SELECT EXTRACT(EPOCH FROM clock_timestamp()-created_at)::int FROM public.repurposepro_recovery_probe WHERE id='${token}-before'")
test "$archive_delay" -le 900 || { echo 'WAL archival missed the 15-minute recovery target.' >&2; exit 1; }
sleep 1
psql_local -c "INSERT INTO public.repurposepro_recovery_probe(id) VALUES ('${token}-after')"
runuser -u postgres -- pgbackrest --stanza=production check > "$work/archive-after.log" 2>&1
runuser -u postgres -- pgbackrest --stanza=production --pg1-path="$work/data" \
  --set="$backup_set" --type=time --target="$target" --target-action=promote restore > "$work/restore.log" 2>&1
runuser -u postgres -- pg_ctl -D "$work/data" -l "$work/recovery.log" -o \
  "-c config_file=/etc/postgresql/17/main/postgresql.conf -c data_directory=$work/data -c port=55432 -c listen_addresses='' -c unix_socket_directories=$work/socket -c ssl=off -c archive_mode=off -c shared_buffers=64MB -c external_pid_file=$work/recovery.pid" -w -t 180 start > "$work/start.log" 2>&1
restored=$(runuser -u postgres -- psql -XAtq -v ON_ERROR_STOP=1 -h "$work/socket" -p 55432 -d postgres \
  -c "SELECT count(*) FILTER (WHERE id='${token}-before')||','||count(*) FILTER (WHERE id='${token}-after') FROM public.repurposepro_recovery_probe")
test "$restored" = 1,0 || { echo 'Point-in-time recovery verification failed.' >&2; exit 1; }
cleanup
trap - EXIT
printf '{"pitr_verified":true,"archive_delay_seconds":%s,"target":"%s","backup_set":"%s"}\n' \
  "$archive_delay" "$target" "$backup_set" > /var/lib/repurposepro-database/last-restore-drill.json
cat /var/lib/repurposepro-database/last-restore-drill.json
# Delete only this validated, non-mounted, successful disposable restore directory.
test "$(dirname "$(realpath "$work")")" = /srv/postgresql
test ! -L "$work"
mountpoint -q "$work" && exit 1
rm -rf -- "$work"
