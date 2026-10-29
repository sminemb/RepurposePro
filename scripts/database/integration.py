#!/usr/bin/env python3
"""Disposable-container test only. Never runs against a remote database."""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
from unittest.mock import patch

import migrate


def main():
    if os.environ.get("DATABASE_MIGRATION_TEST_CONTAINER") != "true":
        raise RuntimeError("This fixture is restricted to the disposable test container.")
    with tempfile.TemporaryDirectory() as work:
        work = Path(work)
        migrate.prepare_roles(argparse.Namespace(credentials=str(work / "credentials.env")))
        migrate.local_write("postgres", "CREATE DATABASE sourcefixture OWNER repurposepro_owner;")
        env = migrate.clean_environment()
        env.update(PGHOST="/var/run/postgresql", PGUSER="postgres", PGDATABASE="sourcefixture")
        sql = "SET ROLE repurposepro_owner; ALTER SCHEMA public OWNER TO repurposepro_owner; REVOKE CREATE ON SCHEMA public FROM PUBLIC; CREATE SCHEMA drizzle; CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint);\n"
        files = sorted(Path("/workspace/packages/db/drizzle").glob("*.sql"))
        for path in files:
            sql += path.read_text() + "\n"
        sql += """
INSERT INTO users(id,name,email,email_verified) VALUES ('migration-user','Migration fixture','migration@example.invalid',false);
INSERT INTO accounts(id,account_id,provider_id,user_id,password) VALUES ('migration-account','migration-user','credential','migration-user','opaque-password-hash-fixture');
INSERT INTO sessions(id,user_id,token,expires_at) VALUES ('migration-session','migration-user','opaque-session-token-fixture','2030-01-01T00:00:00Z');
CREATE TABLE public.transfer_identity_test(id bigserial PRIMARY KEY,payload jsonb NOT NULL);
INSERT INTO public.transfer_identity_test(payload) VALUES ('{"test":"migration"}'),('{"test":"sequence"}');
INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES ('fixture-migration',1792217200000);
"""
        psql = subprocess.run(migrate.pg_command("psql", True) + ["-Xq", "-v", "ON_ERROR_STOP=1"],
                              env=env, input=sql, text=True, capture_output=True)
        if psql.returncode:
            raise RuntimeError("Fixture schema failed: " + psql.stderr[-2500:])
        source_env = migrate.clean_environment()
        source_env.update(PGDATABASE="sourcefixture", PGHOST="127.0.0.1", PGUSER="repurposepro_owner", PGAPPNAME="repurposepro-db-transfer")
        os.environ["MIGRATION_ARCHIVE_PASSPHRASE"] = secrets.token_hex(32)
        archive = str(work / "source.dump.enc")
        with patch.object(migrate, "source_environment", return_value=source_env), patch.object(migrate, "require_source_window"):
            migrate.export_database(argparse.Namespace(source_env="unused", maintenance_confirmed=True, archive=archive))
        report = str(work / "rehearsal.json")
        migrate.restore_database(argparse.Namespace(archive=archive, database="repurposepro_rehearsal", report=report, rehearsal_report=None))
        migrate.restore_database(argparse.Namespace(archive=archive, database="repurposepro", report=str(work / "production.json"), rehearsal_report=report))
        migrate.local_write("repurposepro", "UPDATE public.users SET name='Changed after cutover' WHERE id='migration-user';")
        try:
            migrate.verify_target(argparse.Namespace(archive=archive, database="repurposepro", report=str(work / "invalid.json")))
        except migrate.TransferError as error:
            assert "data" in str(error)
        else:
            raise AssertionError("Verification failed to detect changed user data.")
        print(json.dumps({"migrations_tested": len(files), "encrypted_export": True, "rehearsal_restore": True,
                          "production_restore": True, "auth_rows_preserved": True, "data_change_detected": True}))


if __name__ == "__main__":
    main()
