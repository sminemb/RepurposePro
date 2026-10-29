#!/usr/bin/env python3
"""Read official AWS Price List rates and fail closed before database provisioning.

Uses the AWS CLI's existing credentials. No resources are created. An unavailable,
ambiguous or stale price is a failure, not permission to substitute an estimate.
"""
import argparse
import datetime as dt
from decimal import Decimal
import json
from pathlib import Path
import subprocess


class CostError(Exception):
    pass


def aws(arguments, profile, timeout=120):
    command = ["aws"] + (["--profile", profile] if profile else []) + arguments + ["--output", "json", "--no-cli-pager"]
    result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise CostError("AWS pricing/identity access failed. Grant the scoped preflight permissions before provisioning.")
    return json.loads(result.stdout) if result.stdout.strip() else {}


def price(service, filters, unit, profile):
    products = aws(["pricing", "get-products", "--region", "us-east-1", "--service-code", service,
                    "--filters", json.dumps([{"Type": "TERM_MATCH", "Field": k, "Value": v} for k, v in filters.items()])], profile)
    prices = set()
    for raw in products.get("PriceList", []):
        item = json.loads(raw)
        for term in item.get("terms", {}).get("OnDemand", {}).values():
            for rate in term.get("priceDimensions", {}).values():
                if rate.get("unit") == unit and rate.get("beginRange") == "0":
                    prices.add(Decimal(rate["pricePerUnit"]["USD"]))
    if len(prices) != 1 or next(iter(prices)) <= 0:
        raise CostError("Official rate is missing or ambiguous; refine filters before provisioning.")
    return next(iter(prices))


def estimate(rates):
    # Conservative 31-day month, no promotional credits or shared free allowances.
    quantities = {"compute": Decimal(744), "storage": Decimal(20), "ipv4": Decimal(744),
                  "backup_storage": Decimal(10), "private_dns": Decimal(1),
                  "custom_metrics": Decimal(4), "alarms": Decimal(2)}
    items = {name: rates[name] * quantity for name, quantity in quantities.items()}
    # Includes low-volume requests, DNS queries, transfer, and retained backup versions.
    items["variable_usage_reserve"] = Decimal("1.00")
    total = sum(items.values())
    return {"line_items_usd": {k: str(v.quantize(Decimal("0.01"))) for k, v in items.items()},
            "total_usd": str(total.quantize(Decimal("0.01"))), "within_budget": total <= Decimal("25.00")}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile")
    parser.add_argument("--out", default=".artifacts/database/cost-report.json")
    args = parser.parse_args()
    try:
        identity = aws(["sts", "get-caller-identity", "--region", "ap-southeast-1"], args.profile)
        if identity["Account"] != "402365884836":
            raise CostError("Wrong AWS account; no resources were changed.")
        sg = {"regionCode": "ap-southeast-1"}
        rates = {
            "compute": price("AmazonEC2", {**sg, "instanceType": "t4g.small", "operatingSystem": "Linux", "tenancy": "Shared", "preInstalledSw": "NA", "capacitystatus": "Used"}, "Hrs", args.profile),
            "storage": price("AmazonEC2", {**sg, "volumeApiName": "gp3", "productFamily": "Storage"}, "GB-Mo", args.profile),
            "ipv4": price("AmazonVPC", {**sg, "usagetype": "APS1-PublicIPv4:InUseAddress"}, "Hrs", args.profile),
            "backup_storage": price("AmazonS3", {**sg, "storageClass": "General Purpose", "volumeType": "Standard", "productFamily": "Storage"}, "GB-Mo", args.profile),
            "private_dns": price("AmazonRoute53", {"usagetype": "HostedZone"}, "HostedZone", args.profile),
            "custom_metrics": price("AmazonCloudWatch", {**sg, "group": "Metric"}, "Metrics", args.profile),
            "alarms": price("AmazonCloudWatch", {**sg, "group": "Alarm", "alarmType": "Standard"}, "Alarms", args.profile),
        }
        report = {"checked_at": dt.datetime.now(dt.timezone.utc).isoformat(), "account": identity["Account"],
                  "region": "ap-southeast-1", "source": "AWS Price List GetProducts", "rates": {k: str(v) for k, v in rates.items()},
                  "assumptions": "20 GiB EBS total; 10 GiB S3 including versions; 31 days; no credits; no NAT, replica or dedicated Vercel egress; variable usage is monitored, not hard-capped", **estimate(rates)}
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
        if not report["within_budget"]:
            parser.exit(1, "Estimate exceeds $25/month. Do not provision.\n")
    except CostError as error:
        parser.exit(1, str(error) + "\n")
    except Exception:
        parser.exit(1, "Preflight failed. No resources were provisioned.\n")


if __name__ == "__main__":
    main()
