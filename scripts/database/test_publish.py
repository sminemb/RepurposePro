import unittest
import datetime as dt

import migrate
import publish


class PublishSafetyTests(unittest.TestCase):
    def test_recovery_proof_must_be_recent_and_meet_the_fifteen_minute_target(self):
        now = dt.datetime(2026, 11, 1, tzinfo=dt.timezone.utc)
        report = {"pitr_verified": True, "archive_delay_seconds": 30, "target": now.isoformat()}
        publish.require_recovery_report(report, now)
        for change in ({"pitr_verified": False}, {"archive_delay_seconds": 901}, {"target": (now-dt.timedelta(days=2)).isoformat()}):
            with self.assertRaises(migrate.TransferError):
                publish.require_recovery_report({**report, **change}, now)

    def test_refuses_any_live_or_missing_production_service(self):
        stopped = {"services": [{"serviceName": name, "desiredCount": 0, "runningCount": 0, "pendingCount": 0} for name in publish.SERVICES]}
        publish.require_stopped_services(stopped)
        with self.assertRaises(migrate.TransferError):
            publish.require_stopped_services({"services": []})
        for key in ("desiredCount", "runningCount", "pendingCount"):
            changed = {"services": [dict(service) for service in stopped["services"]]}
            changed["services"][0][key] = 1
            with self.assertRaises(migrate.TransferError):
                publish.require_stopped_services(changed)

    def test_does_not_publish_owner_credentials_or_staging_connections(self):
        env = {key: f"postgresql://{role}:{'a'*64}@db.re-purpose.pro:5432/repurposepro" for key, role in publish.KEYS.items()}
        env.update(DATABASE_SSL="true", DATABASE_POOL_MAX="2")
        publish.validate_target(env)
        for value in (env["DATABASE_URL"].replace("repurposepro_runtime", "repurposepro_owner"),
                      env["DATABASE_URL"].replace("db.re-purpose.pro", "staging.example.com"),
                      env["DATABASE_URL"] + "?sslmode=disable"):
            with self.assertRaises(migrate.TransferError):
                publish.validate_target({**env, "DATABASE_URL": value})


if __name__ == "__main__":
    unittest.main()
