"""Disposable-container verification for explicit empty production initialization."""
import json
import os
from pathlib import Path
import secrets
import sys
import tempfile

import fresh
import migrate

if os.environ.get("DATABASE_MIGRATION_TEST_CONTAINER") != "true":
    raise RuntimeError("Disposable test container only")
with tempfile.TemporaryDirectory() as work:
    os.environ["MIGRATION_ARCHIVE_PASSPHRASE"] = secrets.token_hex(32)
    sys.argv = ["fresh.py", "--confirm-empty-start", "--migrations", "/workspace/packages/db/drizzle",
                "--credentials", work + "/target.env", "--report", work + "/report.json"]
    fresh.main()
    report = migrate.open_manifest(work + "/report.json")
    assert report["initialization"] == "fresh" and report["migrations"] == 50
    assert report["empty_application_tables"] is True
    sys.argv[-1] = work + "/second-report.json"
    try:
        fresh.main()
    except SystemExit as error:
        assert error.code == 1
    else:
        raise AssertionError("Existing database was not protected")
    assert Path(work + "/target.env").exists()
    print(json.dumps({"fresh_initialization": True, "journal_entries": 50, "existing_database_protected": True}))
