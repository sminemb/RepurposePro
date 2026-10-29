#!/usr/bin/env python3
"""Create/review the database change set only after a fresh official cost check.

Default is change-set review. --execute additionally provisions the reviewed plan.
This never exports Neon data or switches production application connections.
"""
import argparse
import datetime as dt
from pathlib import Path
import subprocess
import shutil
import sys

import cost

ROOT = Path(__file__).resolve().parents[2]
STACK = "RepurposePro-Production-Database"


def require_cost_report(report, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    checked = dt.datetime.fromisoformat(report["checked_at"])
    if not dt.timedelta(0) <= now - checked <= dt.timedelta(hours=24):
        raise cost.CostError("Official cost report must be less than 24 hours old.")
    if report.get("account") != "402365884836" or report.get("region") != "ap-southeast-1" or report.get("source") != "AWS Price List GetProducts":
        raise cost.CostError("Wrong account, region, or price source in cost report.")
    from decimal import Decimal
    rates = {key: Decimal(value) for key, value in report["rates"].items()}
    if any(not value.is_finite() or value <= 0 for value in rates.values()):
        raise cost.CostError("Invalid official rates.")
    if not cost.estimate(rates)["within_budget"]:
        raise cost.CostError("Official estimate exceeds $25/month. No provisioning is allowed.")


def require_validation_report(report):
    if not isinstance(report, dict) or not isinstance(report.get("OperationEvents"), list):
        raise cost.CostError("CloudFormation validation results were not readable; do not execute.")
    findings = [event for event in report["OperationEvents"]
                if event.get("EventType") == "VALIDATION_ERROR"]
    if findings:
        raise cost.CostError("CloudFormation validation findings require review; do not execute. " +
                             str([{"resource": event.get("LogicalResourceId"),
                                   "validation": event.get("ValidationName"),
                                   "mode": event.get("ValidationFailureMode"),
                                   "reason": event.get("ValidationStatusReason")} for event in findings]))


def main():
    import json
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile")
    parser.add_argument("--task-security-group", required=True)
    parser.add_argument("--alarm-topic-arn", default="")
    parser.add_argument("--alert-email", default="")
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    try:
        if not args.alarm_topic_arn and not args.alert_email:
            raise cost.CostError("Specify --alert-email or an existing --alarm-topic-arn.")
        # Rerun preflight instead of trusting an old checked-in spreadsheet or quoted price.
        subprocess.run([sys.executable, str(ROOT / "scripts/database/cost.py")] +
                       (["--profile", args.profile] if args.profile else []), cwd=ROOT, check=True)
        report = json.loads((ROOT / ".artifacts/database/cost-report.json").read_text())
        require_cost_report(report)
        aws = lambda command: cost.aws(command + ["--region", "ap-southeast-1"], args.profile,
                                       timeout=1800 if command[:2] == ["cloudformation", "wait"] else 120)
        if args.alarm_topic_arn:
            subscriptions = aws(["sns", "list-subscriptions-by-topic", "--topic-arn", args.alarm_topic_arn])
            if not any(s.get("SubscriptionArn", "").startswith("arn:") for s in subscriptions.get("Subscriptions", [])):
                raise cost.CostError("Existing alarm topic has no confirmed notification subscription.")
        pnpm = shutil.which("pnpm")
        if not pnpm:
            raise cost.CostError("The repository's pnpm executable is required.")
        subprocess.run([pnpm, "db:server:build"], cwd=ROOT, check=True)
        template = ROOT / ".artifacts/database/production-database.cloudformation.json"
        aws(["cloudformation", "validate-template", "--template-body", "file://" + str(template)])
        name = "database-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S")
        # Existing stacks are updated; no resource replacement is accepted by this wrapper.
        stacks = aws(["cloudformation", "list-stacks", "--stack-status-filter", "CREATE_COMPLETE", "UPDATE_COMPLETE", "UPDATE_ROLLBACK_COMPLETE"])
        exists = any(s["StackName"] == STACK for s in stacks.get("StackSummaries", []))
        parameters = [{"ParameterKey": "ProductionTaskSecurityGroup", "ParameterValue": args.task_security_group},
                      {"ParameterKey": "AlarmTopicArn", "ParameterValue": args.alarm_topic_arn},
                      {"ParameterKey": "AlertEmail", "ParameterValue": args.alert_email}]
        change = aws(["cloudformation", "create-change-set", "--stack-name", STACK, "--change-set-name", name,
                      "--change-set-type", "UPDATE" if exists else "CREATE", "--role-arn", "arn:aws:iam::402365884836:role/RepurposeProCloudFormationExecutionRole",
                      "--capabilities", "CAPABILITY_NAMED_IAM", "--parameters", json.dumps(parameters),
                      "--template-body", "file://" + str(template), "--tags", "Key=Project,Value=RepurposePro", "Key=Environment,Value=production"])
        aws(["cloudformation", "wait", "change-set-create-complete", "--change-set-name", change["Id"]])
        details = aws(["cloudformation", "describe-change-set", "--change-set-name", change["Id"]])
        changes = [c["ResourceChange"] for c in details.get("Changes", [])]
        print(json.dumps({"change_set": change["Id"], "changes": changes}, indent=2))
        if any(c.get("Action") == "Remove" or c.get("Replacement") in ("True", "Conditional") for c in changes):
            raise cost.CostError("Destructive changes or replacements need a separate recovery review; not executed.")
        validation = aws(["cloudformation", "describe-events", "--change-set-name", change["Id"]])
        require_validation_report(validation)
        if args.execute:
            aws(["cloudformation", "execute-change-set", "--change-set-name", change["Id"]])
            aws(["cloudformation", "wait", "stack-update-complete" if exists else "stack-create-complete", "--stack-name", STACK])
            print("Stack ready. Verify bootstrap, public DNS, TLS, backup recovery and source access before any cutover.")
        else:
            print("Change set ready for review; no charged database resources were provisioned.")
    except subprocess.TimeoutExpired:
        parser.exit(1, "Local AWS wait timed out. The stack operation may still be running. Inspect the live stack before retrying; production connections were not changed.\n")
    except (cost.CostError, subprocess.CalledProcessError) as error:
        parser.exit(1, str(error) + "\n")
    except Exception:
        parser.exit(1, "Deployment stopped. No production connection changes were made.\n")


if __name__ == "__main__":
    main()
