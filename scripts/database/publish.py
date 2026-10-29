#!/usr/bin/env python3
"""Publish five production DB secrets only while every writer is stopped.

Never starts services or changes Vercel. Values travel in private temporary files,
not command arguments or output. Old secret version IDs are recorded for rollback.
"""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import tempfile
from urllib.error import HTTPError
from urllib.request import urlopen
from urllib.parse import urlparse
import uuid

import cost
import migrate

KEYS = dict(zip(("DATABASE_URL", "DATABASE_CHECKOUT_URL", "DATABASE_WEBHOOK_URL", "DATABASE_PROCESSING_URL", "DATABASE_ADMIN_URL"), migrate.ROLES[1:]))
SERVICES = {"repurposepro-production-api", "repurposepro-production-worker"}


def validate_target(environment):
    if environment.get("DATABASE_SSL") != "true" or environment.get("DATABASE_POOL_MAX") != "2":
        raise migrate.TransferError("Target must retain verified TLS and a pool maximum of two.")
    for key, role in KEYS.items():
        url = urlparse(environment.get(key, ""))
        if (url.scheme != "postgresql" or url.hostname != "db.re-purpose.pro" or url.path != "/repurposepro"
                or url.port != 5432 or url.username != role or len(url.password or "") < 32 or url.query or url.fragment):
            raise migrate.TransferError("Invalid target connection for " + key + ".")


def require_stopped_services(response):
    services = response.get("services", [])
    if response.get("failures") or {s["serviceName"] for s in services} != SERVICES:
        raise migrate.TransferError("Both production ECS services must be present in the readiness response.")
    if any(s.get(k, -1) != 0 for s in services for k in ("desiredCount", "runningCount", "pendingCount")):
        raise migrate.TransferError("Production API and worker must be completely stopped before publishing secrets.")


def require_maintenance():
    try:
        with urlopen("https://re-purpose.pro/api/auth/get-session", timeout=15) as _:
            raise migrate.TransferError("Production auth is not in maintenance.")
    except HTTPError as response:
        if response.code != 503 or json.loads(response.read(4096)).get("code") != "AUTH_MAINTENANCE":
            raise migrate.TransferError("Production auth is not in the expected maintenance state.")


def require_recovery_report(report, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    age = now - dt.datetime.fromisoformat(report["target"])
    if (report.get("pitr_verified") is not True or not 0 <= report.get("archive_delay_seconds", -1) <= 900
            or not dt.timedelta(0) <= age <= dt.timedelta(hours=24)):
        raise migrate.TransferError("A successful S3 point-in-time recovery drill from the last 24 hours is required.")


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target-env", required=True)
    parser.add_argument("--verification-report", required=True)
    parser.add_argument("--recovery-report", required=True)
    parser.add_argument("--rollback-record", required=True)
    parser.add_argument("--profile")
    parser.add_argument("--early-migration-authorized", action="store_true",
                        help="Owner explicitly authorized migration before the original November 1 window.")
    parser.add_argument("--fresh-start-authorized", action="store_true",
                        help="Owner confirmed an empty production database; old Neon data stays untouched.")
    args = parser.parse_args()
    record = {"published_versions": {}, "previous_versions": {}}
    rollback = Path(args.rollback_record)
    try:
        migrate.require_source_window(early_authorized=args.early_migration_authorized)
        if rollback.exists():
            raise migrate.TransferError("Rollback record already exists; inspect before retrying publication.")
        verified = migrate.open_manifest(args.verification_report)
        if verified.get("initialization") == "fresh" and (not args.fresh_start_authorized or
                verified.get("empty_application_tables") is not True or verified.get("migrations", 0) < 1):
            raise migrate.TransferError("A verified empty initialization requires explicit --fresh-start-authorized.")
        require_recovery_report(json.loads(Path(args.recovery_report).read_text()))
        age = dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(verified["verified_at"])
        if verified.get("database") != "repurposepro" or not dt.timedelta(0) <= age <= dt.timedelta(hours=1):
            raise migrate.TransferError("A production restore verified within the last hour is required.")
        environment = migrate.read_private_env(args.target_env)
        validate_target(environment)
        require_maintenance()
        aws = lambda command: cost.aws(command + ["--region", "ap-southeast-1"], args.profile)
        identity = aws(["sts", "get-caller-identity"])
        if identity["Account"] != "402365884836":
            raise migrate.TransferError("Wrong AWS account.")
        require_stopped_services(aws(["ecs", "describe-services", "--cluster", "repurposepro-production",
                                     "--services", *sorted(SERVICES)]))
        stack = aws(["cloudformation", "describe-stacks", "--stack-name", "RepurposePro-Production-Database"])
        outputs = {item["OutputKey"]: item["OutputValue"] for item in stack["Stacks"][0]["Outputs"]}
        subscribers = aws(["sns", "list-subscriptions-by-topic", "--topic-arn", outputs["AlarmTopicArn"]])
        if not any(s.get("SubscriptionArn", "").startswith("arn:") for s in subscribers.get("Subscriptions", [])):
            raise migrate.TransferError("Confirm the AWS alert email subscription before cutover.")
        alarms = aws(["cloudwatch", "describe-alarms", "--alarm-names", "repurposepro-production-database-host", "repurposepro-production-database-health"])
        if len(alarms.get("MetricAlarms", [])) != 2 or any(a["StateValue"] != "OK" for a in alarms["MetricAlarms"]):
            raise migrate.TransferError("Both database health alarms must be OK before cutover.")
        rollback.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        # Record old version IDs before making any changes. No secret values are recorded.
        for key in KEYS:
            name = "repurposepro/production/" + key
            metadata = aws(["secretsmanager", "describe-secret", "--secret-id", name])
            current = [v for v, stages in metadata.get("VersionIdsToStages", {}).items() if "AWSCURRENT" in stages]
            if len(current) != 1:
                raise migrate.TransferError("Could not identify the rollback version for " + key)
            record["previous_versions"][name] = current[0]
        with rollback.open("x") as output:
            json.dump(record, output, indent=2)
        with tempfile.TemporaryDirectory(prefix="repurposepro-db-publish-") as work:
            secret = Path(work) / "value"
            for key in KEYS:
                secret.write_text(environment[key])
                secret.chmod(0o600)
                name = "repurposepro/production/" + key
                result = aws(["secretsmanager", "put-secret-value", "--secret-id", name, "--client-request-token", str(uuid.uuid4()),
                              "--secret-string", "file://" + str(secret)])
                record["published_versions"][name] = result["VersionId"]
                rollback.write_text(json.dumps(record, indent=2) + "\n")
        print("Five database secrets published. API and worker remain stopped; Vercel maintenance remains enabled.")
    except (migrate.TransferError, cost.CostError) as error:
        parser.exit(1, str(error) + "\n")
    except Exception:
        parser.exit(1, "Publication stopped. Keep maintenance enabled and ECS stopped; inspect the private rollback record.\n")


if __name__ == "__main__":
    main()
