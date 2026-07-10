import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export interface DatabaseClientOptions {
  readonly connectionString: string;
  readonly poolMax: number;
  readonly ssl: boolean;
}

export interface DatabaseClient {
  readonly db: NodePgDatabase;
  readonly pool: Pool;
}

export function createDatabaseClient(options: DatabaseClientOptions): DatabaseClient {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.poolMax,
    ssl: options.ssl ? { rejectUnauthorized: true } : undefined,
  });

  return {
    db: drizzle({ client: pool }),
    pool,
  };
}

export async function checkDatabaseConnection(client: DatabaseClient): Promise<void> {
  await client.db.execute(sql`select 1`);
}

export async function closeDatabaseClient(client: DatabaseClient): Promise<void> {
  await client.pool.end();
}
