import { Pool } from "pg";

// Roles are cluster-wide; the existing runner restores development credentials afterward.
export default async function setup() {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_BOOTSTRAP_URL });
  try {
    const password = decodeURIComponent(new URL(process.env.TEST_DATABASE_RUNTIME_URL!).password);
    const statement = await pool.query<{ statement: string }>(
      "SELECT format('CREATE ROLE repurposepro_admin LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', $1::text) AS statement",
      [password],
    );
    await pool.query(statement.rows[0]!.statement).catch((error: unknown) => {
      if (!(
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "42710"
      ))
        throw error;
    });
    const alter = await pool.query<{ statement: string }>(
      "SELECT format('ALTER ROLE repurposepro_admin LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', $1::text) AS statement",
      [password],
    );
    await pool.query(alter.rows[0]!.statement);
  } finally {
    await pool.end();
  }
}
