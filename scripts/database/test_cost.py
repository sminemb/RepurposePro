from decimal import Decimal
import unittest

from cost import estimate
import datetime as dt
from deploy import require_cost_report, require_validation_report


class CostGateTests(unittest.TestCase):
    def test_unavailable_or_flagged_service_validation_stops_deployment(self):
        require_validation_report({"OperationEvents": []})
        require_validation_report({"OperationEvents": [{"EventType": "STACK_EVENT"}]})
        for report in ({}, {"OperationEvents": None},
                       {"OperationEvents": [{"EventType": "VALIDATION_ERROR", "ValidationFailureMode": "FAIL"}]},
                       {"OperationEvents": [{"EventType": "VALIDATION_ERROR", "ValidationFailureMode": "WARN"}]}):
            with self.assertRaises(Exception):
                require_validation_report(report)

    def test_includes_all_recurring_services_and_rejects_over_budget(self):
        rates = dict(compute=Decimal("0.0212"), storage=Decimal("0.096"), ipv4=Decimal("0.005"),
                     backup_storage=Decimal("0.025"), private_dns=Decimal("0.5"), custom_metrics=Decimal("0.3"), alarms=Decimal("0.1"))
        result = estimate(rates)
        self.assertTrue(result["within_budget"])
        self.assertEqual(len(result["line_items_usd"]), 8)
        self.assertEqual(result["line_items_usd"]["ipv4"], "3.72")
        rates["compute"] = Decimal("0.05")
        self.assertFalse(estimate(rates)["within_budget"])

    def test_deployment_rechecks_report_identity_age_and_budget(self):
        now = dt.datetime(2026, 10, 26, tzinfo=dt.timezone.utc)
        rates = dict(compute="0.0212", storage="0.096", ipv4="0.005", backup_storage="0.025",
                     private_dns="0.5", custom_metrics="0.3", alarms="0.1")
        report = dict(account="402365884836", region="ap-southeast-1", source="AWS Price List GetProducts",
                      checked_at=now.isoformat(), rates=rates)
        require_cost_report(report, now)
        for change in ({"account": "other"}, {"region": "us-east-1"}, {"checked_at": (now-dt.timedelta(days=2)).isoformat()},
                       {"rates": {**rates, "compute": "0.5"}}, {"rates": {**rates, "compute": "-1"}}):
            with self.assertRaises(Exception):
                require_cost_report({**report, **change}, now)


if __name__ == "__main__":
    unittest.main()
