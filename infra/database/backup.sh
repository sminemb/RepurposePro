#!/bin/bash
set -euo pipefail
test "$#" -eq 1
case "$1" in full|diff) ;; *) exit 2 ;; esac
exec 9>/var/lib/repurposepro-database/backup.lock
flock --nonblock 9 || exit 0
if runuser -u postgres -- pgbackrest --stanza=production --type="$1" backup; then
  rm -f /var/lib/repurposepro-database/backup-failed
else
  touch /var/lib/repurposepro-database/backup-failed
  exit 1
fi
