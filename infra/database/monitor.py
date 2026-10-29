#!/usr/bin/python3
"""Publish fixed health metrics only; never publish SQL, credentials or database rows."""
import datetime
import json
import pathlib
import shutil
import subprocess
import sys
import time

import boto3


def command(args):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=20).stdout.strip()


def sample(now):
    state = pathlib.Path("/var/lib/repurposepro-database")
    disk = shutil.disk_usage("/srv/postgresql")
    disk_used = (disk.total - disk.free) / disk.total * 100
    # Force an archive heartbeat even when idle so missing WAL is observable.
    heartbeat = state / "last-wal-switch"
    if not heartbeat.exists() or now - heartbeat.stat().st_mtime >= 300:
        command(["runuser", "-u", "postgres", "--", "psql", "-XAtq", "-v", "ON_ERROR_STOP=1",
                 "-d", "postgres", "-c", "SELECT pg_switch_wal()"])
        heartbeat.touch()
    age = float(command(["runuser", "-u", "postgres", "--", "psql", "-XAtq", "-v", "ON_ERROR_STOP=1",
                         "-d", "postgres", "-c", "SELECT COALESCE(EXTRACT(EPOCH FROM now()-last_archived_time), 86400) FROM pg_stat_archiver"]))
    info = json.loads(command(["runuser", "-u", "postgres", "--", "pgbackrest", "--stanza=production", "--output=json", "info"]))
    backups = info[0].get("backup", [])
    last = max((b["timestamp"]["stop"] for b in backups), default=0)
    stale = now - last > 26 * 3600
    certificate = subprocess.run(["openssl", "x509", "-checkend", "604800", "-noout", "-in",
                                  "/etc/postgresql/17/main/tls/fullchain.pem"],
                                 capture_output=True, timeout=10).returncode == 0
    unhealthy = disk_used >= 80 or age >= 600 or stale or not certificate or (state / "backup-failed").exists()
    return {"DiskUsedPercent": disk_used, "ArchiveLagSeconds": max(0, age), "BackupAgeSeconds": max(0, now - last), "Unhealthy": int(unhealthy)}


def main():
    values = {"Unhealthy": 1}
    try:
        values = sample(time.time())
    except Exception:
        # The alarm also treats a missing metric (including AWS errors) as unhealthy.
        pass
    try:
        client = boto3.client("cloudwatch", region_name="ap-southeast-1")
        client.put_metric_data(Namespace="RepurposePro/Database", MetricData=[
            {"MetricName": name, "Dimensions": [{"Name": "Environment", "Value": "production"}],
             "Value": value, "Timestamp": datetime.datetime.now(datetime.timezone.utc)}
            for name, value in values.items()
        ])
    except Exception:
        print("database_health_metrics_failed", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
