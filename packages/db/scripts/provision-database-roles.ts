import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadDotEnv } from "dotenv";
import { Client } from "pg";

const environmentFile = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")].find(
  (candidate) => existsSync(candidate),
);

if (environmentFile) {
  loadDotEnv({ path: environmentFile, override: false, quiet: true });
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function connectionRole(connectionString: string): {
  readonly name: string;
  readonly password: string;
} {
  const url = new URL(connectionString);
  const name = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);

  if (!name || !password) {
    throw new Error("Database connection URLs must include a role name and password.");
  }

  return { name, password };
}

async function runRoleStatement(
  client: Client,
  template: string,
  role: { readonly name: string; readonly password: string },
): Promise<void> {
  const formatted = await client.query<{ readonly statement: string }>(
    "SELECT format($1::text, $2::text, $3::text) AS statement",
    [template, role.name, role.password],
  );

  await client.query(formatted.rows[0]!.statement);
}

async function provisionDatabaseRoles(): Promise<void> {
  const bootstrapUrl = requiredEnvironment("DATABASE_BOOTSTRAP_URL");
  const bootstrapRole = connectionRole(bootstrapUrl);
  const migrationRole = connectionRole(requiredEnvironment("DATABASE_MIGRATION_URL"));
  const runtimeRole = connectionRole(requiredEnvironment("DATABASE_URL"));

  if (
    bootstrapRole.name === "repurposepro_owner" ||
    bootstrapRole.name === "repurposepro_runtime"
  ) {
    throw new Error("DATABASE_BOOTSTRAP_URL must use a role separate from owner and runtime.");
  }
  if (migrationRole.name !== "repurposepro_owner") {
    throw new Error("DATABASE_MIGRATION_URL must use repurposepro_owner.");
  }
  if (runtimeRole.name !== "repurposepro_runtime") {
    throw new Error("DATABASE_URL must use repurposepro_runtime.");
  }

  const bootstrap = new Client({ connectionString: bootstrapUrl });
  await bootstrap.connect();

  try {
    await runRoleStatement(
      bootstrap,
      "CREATE ROLE %I LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
      migrationRole,
    ).catch((error: unknown) => {
      const code =
        typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      if (code !== "42710") {
        throw error;
      }
    });
    await runRoleStatement(
      bootstrap,
      "ALTER ROLE %I LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
      migrationRole,
    );
    await runRoleStatement(
      bootstrap,
      "CREATE ROLE %I LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
      runtimeRole,
    ).catch((error: unknown) => {
      const code =
        typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      if (code !== "42710") {
        throw error;
      }
    });
    await runRoleStatement(
      bootstrap,
      "ALTER ROLE %I LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
      runtimeRole,
    );
    await bootstrap.query("REVOKE repurposepro_owner FROM repurposepro_runtime");
    const revokeBootstrapMembership = await bootstrap.query<{ readonly statement: string }>(
      "SELECT format('REVOKE %I FROM repurposepro_runtime', $1::text) AS statement",
      [bootstrapRole.name],
    );
    await bootstrap.query(revokeBootstrapMembership.rows[0]!.statement);

    const databaseName = new URL(bootstrapUrl).pathname.slice(1);
    const database = await bootstrap.query<{ readonly statement: string }>(
      "SELECT format('ALTER DATABASE %I OWNER TO repurposepro_owner', $1::text) AS statement",
      [databaseName],
    );
    await bootstrap.query(database.rows[0]!.statement);
    await bootstrap.query("ALTER SCHEMA public OWNER TO repurposepro_owner");
    await bootstrap.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await bootstrap.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'drizzle') THEN
          ALTER SCHEMA drizzle OWNER TO repurposepro_owner;
        END IF;

        IF EXISTS (
          SELECT 1
          FROM pg_class AS relation
          INNER JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
          WHERE namespace.nspname = 'drizzle'
            AND relation.relname = '__drizzle_migrations'
        ) THEN
          ALTER TABLE drizzle.__drizzle_migrations OWNER TO repurposepro_owner;
        END IF;
      END;
      $$;
    `);
  } finally {
    await bootstrap.end();
  }
}

void provisionDatabaseRoles().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown role provisioning error.";
  process.stderr.write(`Database role provisioning failed: ${message}\n`);
  process.exitCode = 1;
});
