#!/usr/bin/env python3
"""Run the transfer test in a disposable container with no network or published ports."""
from pathlib import Path
import argparse
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]


def docker(*args, capture=False):
    return subprocess.run(["docker", *args], cwd=ROOT, check=True,
                          capture_output=capture, text=True, timeout=600)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fresh", action="store_true")
    args = parser.parse_args()
    name = "repurposepro-db-migration-" + uuid.uuid4().hex[:12]
    image = "repurposepro-db-migration-test:local"
    docker("build", "-f", "infra/database/migration-test.Dockerfile", "-t", image, "infra/database")
    started = False
    try:
        docker("run", "--detach", "--rm", "--name", name, "--network", "none", "--env", "POSTGRES_HOST_AUTH_METHOD=trust", image, capture=True)
        started = True
        for _ in range(60):
            ready = subprocess.run(["docker", "exec", name, "pg_isready", "-U", "postgres"], capture_output=True, timeout=10)
            if ready.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError("Disposable PostgreSQL fixture did not become ready.")
        docker("cp", "scripts/database", name + ":/tmp/migration-tools")
        docker("cp", "packages/db/drizzle", name + ":/workspace/packages/db/drizzle")
        fixture = "fresh_integration.py" if args.fresh else "integration.py"
        docker("exec", "--user", "root", "--env", "DATABASE_MIGRATION_TEST_CONTAINER=true", name, "python3", "/tmp/migration-tools/" + fixture)
    finally:
        if started:
            docker("rm", "--force", name, capture=True)


if __name__ == "__main__":
    main()
