#!/usr/bin/env python3
"""Initialize an absent local application database after explicit owner approval."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path

import migrate


def migration_sql(folder):
    folder = Path(folder)
    entries = json.loads((folder / "meta/_journal.json").read_text())["entries"]
    if not entries or [e["idx"] for e in entries] != list(range(len(entries))):
        raise migrate.TransferError("Migration journal is missing or out of order.")
    statements = ["BEGIN; SET ROLE repurposepro_owner; ALTER SCHEMA public OWNER TO repurposepro_owner;",
                  "REVOKE CREATE ON SCHEMA public FROM PUBLIC; CREATE SCHEMA drizzle;",
                  "CREATE TABLE drizzle.__drizzle_migrations(id serial PRIMARY KEY,hash text NOT NULL,created_at bigint);"]
    history = []
    for entry in entries:
        tag = entry["tag"]
        if Path(tag).name != tag or "/" in tag or "\\" in tag:
            raise migrate.TransferError("Invalid migration tag.")
        raw = (folder / (tag + ".sql")).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        statements.append(raw.decode("utf-8"))
        statements.append("INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES (" +
                          migrate.literal(digest) + "," + str(int(entry["when"])) + ");")
        history.append({"hash": digest, "created_at": int(entry["when"])})
    statements.append("COMMIT;")
    return "\n".join(statements), history


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--migrations", required=True)
    parser.add_argument("--credentials", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--confirm-empty-start", action="store_true")
    args = parser.parse_args()
    try:
        if not args.confirm_empty_start or os.name != "posix" or os.geteuid() != 0:
            raise migrate.TransferError("Explicit empty-start approval and root on the database host are required.")
        migrate.password()
        if Path(args.report).exists():
            raise migrate.TransferError("Fresh-start report already exists; inspect before retrying.")
        sql, expected = migration_sql(args.migrations)
        if migrate.query(migrate.local_environment("postgres"), "SELECT count(*) FROM pg_database WHERE datname='repurposepro';", True) != "0":
            raise migrate.TransferError("Application database already exists; never overwrite it.")
        migrate.prepare_roles(argparse.Namespace(credentials=args.credentials))
        migrate.local_write("postgres", "CREATE DATABASE repurposepro OWNER repurposepro_owner TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8';")
        migrate.local_write("repurposepro", sql)
        migrate.local_write("repurposepro", "REVOKE ALL ON DATABASE repurposepro FROM PUBLIC; GRANT CONNECT ON DATABASE repurposepro TO " + ",".join(migrate.identifier(r) for r in migrate.ROLES) + ";")
        actual = json.loads(migrate.query(migrate.local_environment("repurposepro"), "SELECT json_agg(json_build_object('hash',hash,'created_at',created_at) ORDER BY created_at) FROM drizzle.__drizzle_migrations", True))
        if actual != expected:
            raise migrate.TransferError("Fresh migration history verification failed.")
        data = migrate.inventory(migrate.local_environment("repurposepro"), True)
        migrate.require_supported_inventory(data)
        if any(table["rows"] != 0 for table in data["data"] if table["schema"] == "public"):
            raise migrate.TransferError("Unexpected application rows in the fresh database; inspect before cutover.")
        migrate.seal_manifest(args.report, {"database": "repurposepro", "initialization": "fresh",
                              "migrations": len(expected), "empty_application_tables": True,
                              "verified_at": dt.datetime.now(dt.timezone.utc).isoformat()})
        print(json.dumps({"fresh_database_verified": True, "migrations": len(expected),
                          "application_tables_empty": True, "restricted_roles": len(migrate.ROLES)}))
    except migrate.TransferError as error:
        parser.exit(1, str(error) + "\n")
    except Exception:
        parser.exit(1, "Fresh initialization stopped. Existing targets are never replaced; inspect privately before retrying.\n")


if __name__ == "__main__":
    main()
