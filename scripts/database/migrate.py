#!/usr/bin/env python3
"""Production-only PostgreSQL transfer. Run on the new host through SSM as root.

Secrets are read from private files/environment, never from CLI arguments. Source is
read-only except for temporary SHARE locks during export. Restore is local only.
"""
import argparse
import datetime as dt
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
from urllib.parse import parse_qsl, unquote, urlparse

NOT_BEFORE = dt.datetime(2026, 11, 1, tzinfo=dt.timezone.utc)
SOURCE_HOST = "ep-flat-math-b3h6holc.c-4.ap-southeast-1.aws.neon.tech"
ROLES = ("repurposepro_owner", "repurposepro_runtime", "repurposepro_checkout",
         "repurposepro_webhook", "repurposepro_processing", "repurposepro_admin")
OWNER = ROLES[0]
HERE = Path(__file__).resolve().parent


class TransferError(Exception):
    pass


def require_source_window(now=None, early_authorized=False):
    if not early_authorized and (now or dt.datetime.now(dt.timezone.utc)) < NOT_BEFORE:
        raise TransferError("Neon export is gated until November 1, 2026 at 08:00 Asia/Manila unless the owner authorizes --early-migration-authorized.")


def read_private_env(path):
    path = Path(path)
    if os.name != "nt" and path.stat().st_mode & 0o077:
        raise TransferError("Credential file must have permissions 0600.")
    result = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        if not sep or not key.replace("_", "").isalnum() or key in result:
            raise TransferError("Invalid or duplicate environment key.")
        result[key] = value.strip().strip('"').strip("'")
    return result


def source_environment(path):
    value = read_private_env(path).get("DATABASE_MIGRATION_URL", "")
    parsed = urlparse(value)
    if (parsed.scheme not in ("postgres", "postgresql") or parsed.hostname != SOURCE_HOST
            or parsed.path != "/repurposepro" or parsed.username != OWNER or not parsed.password
            or parsed.port not in (None, 5432)):
        raise TransferError("Source must be the direct production Neon migration-owner connection.")
    query = dict(parse_qsl(parsed.query))
    if set(query) - {"sslmode", "sslrootcert", "channel_binding", "connect_timeout", "application_name"}:
        raise TransferError("Unsupported source connection parameters.")
    for key in ("sslmode", "sslrootcert", "sslcert", "sslkey", "host", "hostaddr", "service", "options"):
        query.pop(key, None)
    env = clean_environment()
    env.update(PGHOST=parsed.hostname, PGPORT="5432", PGUSER=OWNER, PGPASSWORD=unquote(parsed.password),
               PGDATABASE="repurposepro", PGSSLMODE="verify-full", PGSSLROOTCERT="system", PGCONNECT_TIMEOUT="10",
               PGAPPNAME="repurposepro-db-transfer", PGCHANNELBINDING=query.get("channel_binding", "prefer"))
    return env


def clean_environment():
    return {k: v for k, v in os.environ.items() if not k.startswith("PG")}


def local_environment(database):
    if database not in ("postgres", "repurposepro", "repurposepro_rehearsal"):
        raise TransferError("Only the local production or rehearsal database is allowed.")
    env = clean_environment()
    env.update(PGHOST="/var/run/postgresql", PGUSER="postgres", PGDATABASE=database)
    return env


def identifier(value):
    return '"' + value.replace('"', '""') + '"'


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def pg_command(tool, local=False):
    binary = f"/usr/lib/postgresql/17/bin/{tool}"
    if not Path(binary).is_file():
        raise TransferError("PostgreSQL 17 client tools are required on this Linux host.")
    return (["runuser", "-u", "postgres", "--"] if local else []) + [binary]


def transaction_sql(sql, snapshot=None):
    prefix = "SET timezone='UTC'; SET extra_float_digits=3; SET statement_timeout='10min'; BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
    if snapshot:
        prefix += "SET TRANSACTION SNAPSHOT " + literal(snapshot) + ";\n"
    return prefix + sql.rstrip().rstrip(";") + ";\nCOMMIT;\n"


def query(env, sql, local=False, snapshot=None):
    command = pg_command("psql", local) + ["-XAtq", "-v", "ON_ERROR_STOP=1"]
    response = subprocess.run(command, env=env, input=transaction_sql(sql, snapshot),
                              text=True, capture_output=True, timeout=600)
    if response.returncode:
        raise TransferError("Database inspection failed; no database error text was logged.")
    return response.stdout.strip()


def fingerprint_rows(env, relation, local=False, snapshot=None):
    sql = "SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') FROM ONLY " + relation + " t ORDER BY 1"
    process = subprocess.Popen(pg_command("psql", local) + ["-XAtq", "-v", "ON_ERROR_STOP=1"],
                               env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.DEVNULL, text=True)
    count = 0
    digest = hashlib.sha256()
    try:
        process.stdin.write(transaction_sql(sql, snapshot))
        process.stdin.close()
        # Keep memory bounded on the 2 GiB server, even for tables with millions of rows.
        for line in process.stdout:
            value = line.rstrip("\n")
            if len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
                raise TransferError("Invalid row digest returned during verification.")
            digest.update(line.encode("ascii"))
            count += 1
        if process.wait(timeout=600):
            raise TransferError("Table verification failed; private error details were not logged.")
        return {"rows": count, "sha256": digest.hexdigest()}
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=10)


def inventory(env, local=False, snapshot=None):
    result = json.loads(query(env, (HERE / "inventory.sql").read_text(), local, snapshot))
    if result["major_version"] != 17:
        raise TransferError("Migration requires PostgreSQL 17 on source and target.")
    digests = []
    for table in result["tables"]:
        relation = identifier(table["schema"]) + "." + identifier(table["name"])
        digests.append({**table, **fingerprint_rows(env, relation, local, snapshot)})
    result["data"] = digests
    sequence_values = []
    for sequence in result["sequences"]:
        relation = identifier(sequence["schemaname"]) + "." + identifier(sequence["sequencename"])
        state = query(env, "SELECT json_build_array(last_value,is_called) FROM " + relation, local, snapshot)
        sequence_values.append({**sequence, "state": json.loads(state)})
    result["sequence_values"] = sequence_values
    return result


def compare(source, target):
    different = [key for key in sorted(set(source) | set(target)) if source.get(key) != target.get(key)]
    if different:
        raise TransferError("Verification mismatch in: " + ", ".join(different))


def require_supported_inventory(data):
    config = data["database_configuration"]
    if config["encoding"] != "UTF8" or config["provider"] != "c" or data["other_schemas"]:
        raise TransferError("Source encoding, locale provider or extra schemas require review before transfer.")
    if data["extensions"] or data["unexpected_grantees"] or data["memberships"]:
        raise TransferError("Provider-specific extensions, grants, or role memberships require review before transfer.")
    if {r["rolname"] for r in data["roles"]} != set(ROLES):
        raise TransferError("All six application database roles must be present.")
    for role in data["roles"]:
        if any(role[k] for k in ("rolsuper", "rolinherit", "rolcreaterole", "rolcreatedb", "rolreplication", "rolbypassrls")):
            raise TransferError("Unexpected role privileges; refusing to broaden target access.")
    if any(o["owner"] not in ("", OWNER) for o in data["objects"]):
        raise TransferError("Application objects must be owned by repurposepro_owner.")


def no_writers(env):
    roles = ",".join(literal(r) for r in ROLES[1:])
    sql = f"SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND usename IN ({roles});"
    if query(env, sql) != "0":
        raise TransferError("Source still has application connections. Drain all clients before export.")
    sql = "SELECT count(*) FROM public.processing_jobs WHERE execution_lease_expires_at > now() OR status::text IN ('running','active','processing');"
    if query(env, sql) != "0":
        raise TransferError("Source still has active job leases. Drain or reconcile jobs before export.")


def password():
    value = os.environ.get("MIGRATION_ARCHIVE_PASSPHRASE", "")
    if len(value) < 32:
        raise TransferError("Set MIGRATION_ARCHIVE_PASSPHRASE to an independently stored random secret of at least 32 characters.")
    return value


def archive_mac(path, salt):
    key = hashlib.pbkdf2_hmac("sha256", password().encode(), b"archive:" + bytes.fromhex(salt), 600_000, 32)
    mac = hmac.new(key, digestmod=hashlib.sha256)
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            mac.update(chunk)
    return mac.hexdigest()


def seal_manifest(path, payload):
    salt = secrets.token_hex(16)
    envelope = {"format": 1, "salt": salt, "payload": payload}
    key = hashlib.pbkdf2_hmac("sha256", password().encode(), b"manifest:" + bytes.fromhex(salt), 600_000, 32)
    envelope["mac"] = hmac.new(key, json.dumps(payload, sort_keys=True).encode(), hashlib.sha256).hexdigest()
    with Path(path).open("x") as stream:
        os.chmod(path, 0o600)
        json.dump(envelope, stream, indent=2)


def open_manifest(path):
    envelope = json.loads(Path(path).read_text())
    if envelope.get("format") != 1:
        raise TransferError("Unknown manifest format.")
    key = hashlib.pbkdf2_hmac("sha256", password().encode(), b"manifest:" + bytes.fromhex(envelope["salt"]), 600_000, 32)
    expected = hmac.new(key, json.dumps(envelope["payload"], sort_keys=True).encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, envelope["mac"]):
        raise TransferError("Manifest authentication failed.")
    return envelope["payload"]


def export_database(args):
    require_source_window(early_authorized=getattr(args, "early_migration_authorized", False))
    if not args.maintenance_confirmed:
        raise TransferError("Confirm maintenance, stopped ECS services and drained clients with --maintenance-confirmed.")
    password()
    env = source_environment(args.source_env)
    no_writers(env)
    destination = Path(args.archive).resolve()
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Exclusive creation never overwrites an earlier backup.
    with destination.open("xb") as output:
        os.chmod(destination, 0o600)
        lock = subprocess.Popen(pg_command("psql") + ["-XAtq", "-v", "ON_ERROR_STOP=1"],
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env, text=True)
        children = []
        try:
            tables = json.loads(query(env, (HERE / "inventory.sql").read_text()))["tables"]
            relations = ",".join(identifier(t["schema"]) + "." + identifier(t["name"]) for t in tables)
            lock.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ; SET lock_timeout='10s'; LOCK TABLE " + relations + " IN SHARE MODE; SELECT pg_export_snapshot();\n")
            lock.stdin.flush()
            snapshot = lock.stdout.readline().strip()
            if not snapshot or any(c not in "0123456789ABCDEFabcdef-" for c in snapshot):
                raise TransferError("Could not obtain a stable source snapshot and write locks.")
            before = inventory(env, snapshot=snapshot)
            require_supported_inventory(before)
            dump = subprocess.Popen(pg_command("pg_dump") + ["--format=custom", "--schema=public", "--schema=drizzle", "--no-owner", "--snapshot=" + snapshot],
                                    env=env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            children.append(dump)
            encryption = subprocess.Popen(["openssl", "enc", "-aes-256-cbc", "-salt", "-pbkdf2", "-iter", "600000", "-pass", "env:MIGRATION_ARCHIVE_PASSPHRASE"],
                                          stdin=dump.stdout, stdout=output, stderr=subprocess.DEVNULL)
            children.append(encryption)
            dump.stdout.close()
            encrypted = encryption.wait(timeout=3600)
            dumped = dump.wait(timeout=3600)
            if encrypted or dumped:
                raise TransferError("Encrypted export failed; incomplete archive must not be used.")
            no_writers(env)
            # Sequence values are not MVCC snapshots; catch any unexpected nextval during export.
            compare(before, inventory(env, snapshot=snapshot))
        finally:
            for child in children:
                if child.poll() is None:
                    child.kill()
                    child.wait(timeout=10)
            if lock.stdin:
                try:
                    lock.stdin.write("ROLLBACK;\n")
                    lock.stdin.close()
                except (BrokenPipeError, OSError):
                    pass
            try:
                lock.wait(timeout=10)
            except subprocess.TimeoutExpired:
                lock.kill()
    salt = secrets.token_hex(16)
    seal_manifest(str(destination) + ".json", {"inventory": before, "archive_salt": salt,
                  "archive_mac": archive_mac(destination, salt), "source": SOURCE_HOST,
                  "created_at": dt.datetime.now(dt.timezone.utc).isoformat()})
    print("Encrypted export and authenticated verification manifest created.")


def verify_target(args):
    archive = Path(args.archive).resolve()
    manifest = open_manifest(str(archive) + ".json")
    if not hmac.compare_digest(archive_mac(archive, manifest["archive_salt"]), manifest["archive_mac"]):
        raise TransferError("Archive authentication failed.")
    compare(manifest["inventory"], inventory(local_environment(args.database), True))
    seal_manifest(args.report, {"database": args.database, "archive_mac": manifest["archive_mac"],
                  "verified_at": dt.datetime.now(dt.timezone.utc).isoformat()})
    print("Restore verified: all table data, identities, sequences, schema objects and role permissions match.")


def local_write(database, sql):
    response = subprocess.run(pg_command("psql", True) + ["-Xq", "-v", "ON_ERROR_STOP=1"],
                              env=local_environment(database), input=sql, text=True,
                              capture_output=True, timeout=120)
    if response.returncode:
        raise TransferError("Local database administration failed; private SQL was not logged.")


def restore_permissions(database, source):
    # Schema-filtered dumps omit global default ACLs and special initial public-schema grants.
    # Replay these explicitly, using catalog identifiers and an allowlist of privilege keywords.
    recipients = "PUBLIC," + ",".join(identifier(r) for r in ROLES)
    statements = ["BEGIN", "SET ROLE " + identifier(OWNER)]
    kinds = {"r": "TABLES", "S": "SEQUENCES", "f": "FUNCTIONS", "T": "TYPES", "n": "SCHEMAS"}
    allowed = {"CREATE", "USAGE", "SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "EXECUTE", "MAINTAIN"}

    def grant(grants, prefix, suffix):
        for item in grants:
            if item["grantee"] not in (*ROLES, "PUBLIC") or item["privilege_type"] not in allowed:
                raise TransferError("Unexpected ACL recipient or privilege; review before applying permissions.")
            recipient = "PUBLIC" if item["grantee"] == "PUBLIC" else identifier(item["grantee"])
            statements.append(prefix + "GRANT " + item["privilege_type"] + suffix + " TO " + recipient +
                              (" WITH GRANT OPTION" if item["is_grantable"] else ""))

    for item in source["schema_permissions"]:
        if item["schema"] not in ("public", "drizzle"):
            raise TransferError("Unexpected schema in permissions.")
        suffix = " ON SCHEMA " + identifier(item["schema"])
        statements.append("REVOKE ALL" + suffix + " FROM " + recipients)
        grant(item["grants"], "", suffix)
    for item in source["default_permissions"]:
        if item["schema"] not in ("", "public", "drizzle") or item["kind"] not in kinds:
            raise TransferError("Unexpected default privileges.")
        prefix = "ALTER DEFAULT PRIVILEGES FOR ROLE " + identifier(OWNER)
        if item["schema"]:
            prefix += " IN SCHEMA " + identifier(item["schema"])
        prefix += " "
        suffix = " ON " + kinds[item["kind"]]
        statements.append(prefix + "REVOKE ALL" + suffix + " FROM " + recipients)
        grant(item["grants"], prefix, suffix)
    local_write(database, ";\n".join(statements + ["COMMIT"]) + ";")


def prepare_roles(args):
    path = Path(args.credentials).resolve()
    if path.exists():
        raise TransferError("Target credentials already exist; refusing to rotate them implicitly.")
    existing = json.loads(query(local_environment("postgres"), "SELECT coalesce(json_agg(rolname),'[]') FROM pg_roles WHERE rolname LIKE 'repurposepro_%';", True))
    if existing:
        raise TransferError("Application roles already exist; inspect this host before proceeding.")
    values = {r: secrets.token_hex(32) for r in ROLES}
    sql = "BEGIN;\n" + "\n".join("CREATE ROLE " + identifier(r) + " LOGIN PASSWORD " + literal(p) +
        " NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;" for r, p in values.items()) + "\nCOMMIT;"
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Save credentials before changing PostgreSQL so an interrupted operation cannot lose them.
    with path.open("x") as output:
        os.chmod(path, 0o600)
        keys = ("DATABASE_MIGRATION_URL", "DATABASE_URL", "DATABASE_CHECKOUT_URL", "DATABASE_WEBHOOK_URL", "DATABASE_PROCESSING_URL", "DATABASE_ADMIN_URL")
        for key, role in zip(keys, ROLES):
            output.write(f"{key}=postgresql://{role}:{values[role]}@db.re-purpose.pro:5432/repurposepro\n")
        output.write("DATABASE_RUNTIME_URL=" + f"postgresql://repurposepro_runtime:{values[ROLES[1]]}@db.re-purpose.pro:5432/repurposepro\nDATABASE_SSL=true\nDATABASE_POOL_MAX=2\n")
    local_write("postgres", sql)
    print("Six restricted roles created; credentials saved privately without logging values.")


def restore_database(args):
    if os.geteuid() != 0:
        raise TransferError("Run restore on the dedicated database host as root through SSM.")
    archive = Path(args.archive).resolve()
    manifest = open_manifest(str(archive) + ".json")
    if not hmac.compare_digest(archive_mac(archive, manifest["archive_salt"]), manifest["archive_mac"]):
        raise TransferError("Archive authentication failed; nothing was restored.")
    require_supported_inventory(manifest["inventory"])
    database = args.database
    if database not in ("repurposepro", "repurposepro_rehearsal"):
        raise TransferError("Unsupported target database.")
    exists = query(local_environment("postgres"), "SELECT count(*) FROM pg_database WHERE datname=" + literal(database), True)
    if exists != "0":
        raise TransferError("Target database already exists; restore only into a fresh database.")
    if database == "repurposepro" and not args.rehearsal_report:
        raise TransferError("Production restore requires the authenticated successful rehearsal report.")
    if args.rehearsal_report:
        report = open_manifest(args.rehearsal_report)
        if report.get("archive_mac") != manifest["archive_mac"] or report.get("database") != "repurposepro_rehearsal":
            raise TransferError("Rehearsal report does not belong to this export.")
    # Source role settings are allowlisted. No passwords or provider memberships are copied.
    for role in manifest["inventory"]["roles"]:
        if not role["rolcanlogin"]:
            local_write("postgres", "ALTER ROLE " + identifier(role["rolname"]) + " NOLOGIN;")
        for setting in role["rolconfig"] or []:
            name, _, value = setting.partition("=")
            if name not in ("search_path", "statement_timeout", "lock_timeout", "idle_in_transaction_session_timeout"):
                raise TransferError("Unsupported source role setting; review before restoring.")
            local_write("postgres", "ALTER ROLE " + identifier(role["rolname"]) + " SET " + identifier(name) + " TO " + literal(value) + ";")
    with tempfile.TemporaryDirectory(prefix="repurposepro-restore-") as work:
        plain = Path(work) / "database.dump"
        with plain.open("xb") as output:
            os.chmod(plain, 0o600)
            response = subprocess.run(["openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "600000", "-pass", "env:MIGRATION_ARCHIVE_PASSPHRASE", "-in", str(archive)],
                                      stdout=output, stderr=subprocess.DEVNULL, timeout=3600)
        if response.returncode:
            raise TransferError("Archive decryption failed; target database was not created.")
        config = manifest["inventory"]["database_configuration"]
        local_write("postgres", "CREATE DATABASE " + identifier(database) + " OWNER " + identifier(OWNER) +
                    " TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER libc LC_COLLATE " + literal(config["collation"]) +
                    " LC_CTYPE " + literal(config["ctype"]) + ";")
        # Replacing public is safe only because this tool just created the empty target.
        local_write(database, "DROP SCHEMA public; REVOKE ALL ON DATABASE " + identifier(database) + " FROM PUBLIC; GRANT CONNECT ON DATABASE " + identifier(database) + " TO " + ",".join(identifier(r) for r in ROLES) + ";")
        with plain.open("rb") as data:
            response = subprocess.run(pg_command("pg_restore", True) + ["--dbname=" + database, "--single-transaction", "--exit-on-error", "--no-owner", "--role=" + OWNER],
                                      env=local_environment(database), stdin=data, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3600)
        if response.returncode:
            raise TransferError("Restore failed. The fresh target remains quarantined; inspect before retrying.")
    restore_permissions(database, manifest["inventory"])
    verify_target(args)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("inventory")
    p.add_argument("--source-env", required=True)
    p.add_argument("--out", required=True)
    p = sub.add_parser("export")
    p.add_argument("--source-env", required=True)
    p.add_argument("--archive", required=True)
    p.add_argument("--maintenance-confirmed", action="store_true")
    p.add_argument("--early-migration-authorized", action="store_true",
                   help="Owner explicitly authorized migration before the original November 1 window; all other checks remain required.")
    p = sub.add_parser("prepare-roles")
    p.add_argument("--credentials", required=True)
    p = sub.add_parser("restore")
    p.add_argument("--archive", required=True)
    p.add_argument("--database", choices=["repurposepro", "repurposepro_rehearsal"], required=True)
    p.add_argument("--report", required=True)
    p.add_argument("--rehearsal-report")
    p = sub.add_parser("verify")
    p.add_argument("--archive", required=True)
    p.add_argument("--database", choices=["repurposepro", "repurposepro_rehearsal"], required=True)
    p.add_argument("--report", required=True)
    args = parser.parse_args()
    try:
        if args.command == "inventory":
            data = inventory(source_environment(args.source_env))
            with Path(args.out).open("x") as output:
                json.dump(data, output, indent=2)
            print("Source inventory saved without row data or password hashes.")
        elif args.command == "export":
            export_database(args)
        elif args.command == "prepare-roles":
            prepare_roles(args)
        elif args.command == "verify":
            verify_target(args)
        else:
            restore_database(args)
    except TransferError as error:
        parser.exit(1, str(error) + "\n")
    except Exception:
        parser.exit(1, "Migration stopped. Private exception details were suppressed; inspect the failed stage on the host.\n")


if __name__ == "__main__":
    main()
