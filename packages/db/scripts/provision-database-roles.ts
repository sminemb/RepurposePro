import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadDotEnv } from "dotenv";
import { Client } from "pg";

const environmentFile = [
  resolve(process.cwd(), ".env.database"),
  resolve(process.cwd(), "../../.env.database"),
].find((candidate) => existsSync(candidate));

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

  if (
    !name ||
    !password ||
    password.toLowerCase().includes("replace") ||
    password.toLowerCase().endsWith("_local") ||
    password === "password"
  ) {
    throw new Error(
      "Database connection URLs must include a role name and non-placeholder password.",
    );
  }

  return { name, password };
}

async function assertRoleIsNotSuperuser(client: Client, roleName: string): Promise<void> {
  const result = await client.query<{ readonly rolsuper: boolean }>(
    "SELECT rolsuper FROM pg_roles WHERE rolname = $1",
    [roleName],
  );

  if (result.rows[0]?.rolsuper) {
    throw new Error(`Refusing to provision ${roleName}: application roles must not be superusers.`);
  }
}

async function runRoleStatement(
  client: Client,
  template: string,
  role: { readonly name: string; readonly password: string },
): Promise<void> {
  // Managed Postgres administrators cannot alter the SUPERUSER attribute, even to false.
  // Keep NOSUPERUSER on CREATE ROLE and reject existing superuser roles before updating them.
  if (template.startsWith("ALTER ROLE ")) {
    await assertRoleIsNotSuperuser(client, role.name);
  }
  const formatted = await client.query<{ readonly statement: string }>(
    "SELECT format($1::text, $2::text, $3::text) AS statement",
    [template, role.name, role.password],
  );

  try {
    await client.query(formatted.rows[0]!.statement);
  } catch (error: unknown) {
    if (error instanceof Error) {
      const operation = template.startsWith("CREATE ROLE ") ? "Create" : "Alter";
      error.message = `${operation} ${role.name}: ${error.message}`;
    }
    throw error;
  }
}

async function provisionDatabaseRoles(): Promise<void> {
  const bootstrapUrl = requiredEnvironment("DATABASE_BOOTSTRAP_URL");
  const bootstrapRole = connectionRole(bootstrapUrl);
  const migrationRole = connectionRole(requiredEnvironment("DATABASE_MIGRATION_URL"));
  const runtimeRole = connectionRole(requiredEnvironment("DATABASE_RUNTIME_URL"));
  const checkoutRole = connectionRole(requiredEnvironment("DATABASE_CHECKOUT_URL"));
  const webhookRole = connectionRole(requiredEnvironment("DATABASE_WEBHOOK_URL"));
  const processingRole = connectionRole(requiredEnvironment("DATABASE_PROCESSING_URL"));
  const restrictedRoles = [runtimeRole, checkoutRole, webhookRole, processingRole] as const;
  const adminRole = process.env.DATABASE_ADMIN_URL
    ? connectionRole(process.env.DATABASE_ADMIN_URL)
    : undefined;
  if (adminRole && adminRole.name !== "repurposepro_admin") {
    throw new Error("DATABASE_ADMIN_URL must use repurposepro_admin.");
  }

  if (
    [
      "repurposepro_owner",
      "repurposepro_runtime",
      "repurposepro_checkout",
      "repurposepro_webhook",
      "repurposepro_processing",
      "repurposepro_admin",
    ].includes(bootstrapRole.name)
  ) {
    throw new Error(
      "DATABASE_BOOTSTRAP_URL must use a role separate from owner and runtime roles.",
    );
  }
  if (migrationRole.name !== "repurposepro_owner") {
    throw new Error("DATABASE_MIGRATION_URL must use repurposepro_owner.");
  }
  if (runtimeRole.name !== "repurposepro_runtime") {
    throw new Error("DATABASE_RUNTIME_URL must use repurposepro_runtime.");
  }
  if (checkoutRole.name !== "repurposepro_checkout") {
    throw new Error("DATABASE_CHECKOUT_URL must use repurposepro_checkout.");
  }
  if (webhookRole.name !== "repurposepro_webhook") {
    throw new Error("DATABASE_WEBHOOK_URL must use repurposepro_webhook.");
  }
  if (processingRole.name !== "repurposepro_processing") {
    throw new Error("DATABASE_PROCESSING_URL must use repurposepro_processing.");
  }

  const bootstrap = new Client({ connectionString: bootstrapUrl });
  await bootstrap.connect();

  try {
    await bootstrap.query(
      "DO $$ BEGIN CREATE ROLE repurposepro_admin NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$",
    );
    if (adminRole) {
      await runRoleStatement(
        bootstrap,
        "ALTER ROLE %I LOGIN PASSWORD %L NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
        adminRole,
      );
    } else {
      await assertRoleIsNotSuperuser(bootstrap, "repurposepro_admin");
      await bootstrap.query(
        "ALTER ROLE repurposepro_admin NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
      );
    }
    const memberships = await bootstrap.query<{ statement: string }>(
      "SELECT format('REVOKE %I FROM repurposepro_admin',r.rolname) AS statement FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid WHERE m.member='repurposepro_admin'::regrole",
    );
    for (const row of memberships.rows) await bootstrap.query(row.statement);
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
      "ALTER ROLE %I LOGIN PASSWORD %L NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
      migrationRole,
    );
    for (const role of restrictedRoles) {
      await runRoleStatement(
        bootstrap,
        "CREATE ROLE %I LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
        role,
      ).catch((error: unknown) => {
        const code =
          typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
        if (code !== "42710") {
          throw error;
        }
      });
      await runRoleStatement(
        bootstrap,
        "ALTER ROLE %I LOGIN PASSWORD %L NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
        role,
      );

      const revokeMemberships = await bootstrap.query<{ readonly statement: string }>(
        `SELECT format('REVOKE %I FROM %I', granted.rolname, member.rolname) AS statement
         FROM pg_auth_members AS membership
         JOIN pg_roles AS granted ON granted.oid = membership.roleid
         JOIN pg_roles AS member ON member.oid = membership.member
         WHERE member.rolname = $2 AND granted.rolname IN ('repurposepro_owner', $1)`,
        [bootstrapRole.name, role.name],
      );
      for (const row of revokeMemberships.rows) await bootstrap.query(row.statement);
    }

    // PostgreSQL 16+ gives role creators ADMIN but not SET permission by default.
    // SET permits ownership transfers; INHERIT retains access to pg_database_owner's
    // public schema after the database owner changes. Only the bootstrap receives this grant.
    const ownerMembership = await bootstrap.query<{ readonly statement: string }>(
      "SELECT format('GRANT repurposepro_owner TO %I WITH INHERIT TRUE, SET TRUE', $1::text) AS statement",
      [bootstrapRole.name],
    );
    await bootstrap.query(ownerMembership.rows[0]!.statement);

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
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "42501" &&
    "detail" in error &&
    typeof error.detail === "string"
  ) {
    process.stderr.write(`${error.detail}\n`);
  }
  process.exitCode = 1;
});
