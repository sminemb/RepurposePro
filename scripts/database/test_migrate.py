import datetime as dt
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, MagicMock
import io
import hashlib

import migrate


class MigrationSafetyTests(unittest.TestCase):
    def test_unexpected_schemas_or_locale_cannot_be_silently_dropped(self):
        data = {"database_configuration": {"encoding": "UTF8", "provider": "c"}, "other_schemas": [],
                "extensions": [], "unexpected_grantees": [], "memberships": [], "objects": [],
                "roles": [{"rolname": role, **{key: False for key in ("rolsuper", "rolinherit", "rolcreaterole", "rolcreatedb", "rolreplication", "rolbypassrls")}} for role in migrate.ROLES]}
        migrate.require_supported_inventory(data)
        for changed in ({"other_schemas": ["additional_user_data"]}, {"database_configuration": {"encoding": "LATIN1", "provider": "c"}},
                        {"database_configuration": {"encoding": "UTF8", "provider": "i"}}):
            with self.assertRaises(migrate.TransferError):
                migrate.require_supported_inventory({**data, **changed})

    def test_row_verification_streams_digests_and_counts_duplicates(self):
        output = ("a" * 64 + "\n") * 3
        child = MagicMock()
        child.stdout = io.StringIO(output)
        child.wait.return_value = 0
        child.poll.return_value = 0
        with patch.object(migrate, "pg_command", return_value=["psql"]), patch.object(migrate.subprocess, "Popen", return_value=child):
            actual = migrate.fingerprint_rows({}, '"public"."users"')
        self.assertEqual(actual, {"rows": 3, "sha256": hashlib.sha256(output.encode()).hexdigest()})
        self.assertIn("ORDER BY 1;\nCOMMIT;", child.stdin.write.call_args.args[0])

    def test_export_waits_for_the_agreed_source_window(self):
        with self.assertRaises(migrate.TransferError):
            migrate.require_source_window(dt.datetime(2026, 10, 31, 23, 59, tzinfo=dt.timezone.utc))
        migrate.require_source_window(dt.datetime(2026, 11, 1, tzinfo=dt.timezone.utc))

    def test_owner_can_authorize_earlier_migration_without_skipping_maintenance(self):
        early = dt.datetime(2026, 10, 29, tzinfo=dt.timezone.utc)
        migrate.require_source_window(early, early_authorized=True)
        with self.assertRaisesRegex(migrate.TransferError, "Confirm maintenance"):
            migrate.export_database(type("Args", (), {
                "early_migration_authorized": True, "maintenance_confirmed": False,
            })())

    def test_source_cannot_be_staging_or_a_different_database(self):
        for host, database in [("ep-round-recipe-b34hg37n.c-4.ap-southeast-1.aws.neon.tech", "repurposepro"),
                               (migrate.SOURCE_HOST, "other")]:
            with patch.object(migrate, "read_private_env", return_value={"DATABASE_MIGRATION_URL":
                    f"postgresql://repurposepro_owner:private@{host}/{database}"}):
                with self.assertRaises(migrate.TransferError):
                    migrate.source_environment("unused")

    def test_source_forces_certificate_verification_and_rejects_overrides(self):
        base = f"postgresql://repurposepro_owner:private@{migrate.SOURCE_HOST}/repurposepro"
        with patch.object(migrate, "read_private_env", return_value={"DATABASE_MIGRATION_URL": base + "?sslmode=require"}):
            self.assertEqual("verify-full", migrate.source_environment("unused")["PGSSLMODE"])
        with patch.object(migrate, "read_private_env", return_value={"DATABASE_MIGRATION_URL": base + "?host=other"}):
            with self.assertRaises(migrate.TransferError):
                migrate.source_environment("unused")

    def test_restore_connection_is_local_and_destination_allowlisted(self):
        self.assertEqual(migrate.local_environment("repurposepro")["PGHOST"], "/var/run/postgresql")
        with self.assertRaises(migrate.TransferError):
            migrate.local_environment("staging")

    def test_verification_detects_data_or_permission_changes(self):
        migrate.compare({"data": ["a"], "roles": ["restricted"]}, {"data": ["a"], "roles": ["restricted"]})
        for changed in ({"data": ["b"], "roles": ["restricted"]}, {"data": ["a"], "roles": ["superuser"]}):
            with self.assertRaises(migrate.TransferError):
                migrate.compare({"data": ["a"], "roles": ["restricted"]}, changed)

    def test_manifest_and_archive_tampering_are_detected(self):
        with tempfile.TemporaryDirectory() as work, patch.dict(os.environ, {"MIGRATION_ARCHIVE_PASSPHRASE": "a" * 40}):
            path = Path(work) / "manifest.json"
            migrate.seal_manifest(path, {"archive_mac": "original"})
            self.assertEqual(migrate.open_manifest(path)["archive_mac"], "original")
            changed = json.loads(path.read_text())
            changed["payload"]["archive_mac"] = "modified"
            path.write_text(json.dumps(changed))
            with self.assertRaises(migrate.TransferError):
                migrate.open_manifest(path)
            archive = Path(work) / "dump.enc"
            archive.write_bytes(b"encrypted-original")
            before = migrate.archive_mac(archive, "01" * 16)
            archive.write_bytes(b"encrypted-modified")
            self.assertNotEqual(before, migrate.archive_mac(archive, "01" * 16))

    def test_duplicate_secret_keys_and_accidental_overwrites_are_rejected(self):
        with tempfile.TemporaryDirectory() as work:
            path = Path(work) / "env"
            path.write_text("DATABASE_URL=first\nDATABASE_URL=second\n")
            path.chmod(0o600)
            with self.assertRaises(migrate.TransferError):
                migrate.read_private_env(path)


if __name__ == "__main__":
    unittest.main()
