import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";

import * as schema from "./schema/index.js";

export { schema };

export interface DatabaseClientOptions {
  readonly connectionString: string;
  readonly poolMax: number;
  readonly ssl: boolean;
}

export interface DatabaseClient {
  readonly db: NodePgDatabase<typeof schema>;
  readonly pool: Pool;
}

const connectedClients = new WeakMap<Pool, Set<PoolClient>>();

export function createDatabaseClient(options: DatabaseClientOptions): DatabaseClient {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.poolMax,
    ssl: options.ssl ? { rejectUnauthorized: true } : undefined,
  });
  const clients = new Set<PoolClient>();
  connectedClients.set(pool, clients);
  pool.on("connect", (client: PoolClient) => {
    clients.add(client);
    client.once("end", () => clients.delete(client));
  });

  return {
    db: drizzle({ client: pool, schema }),
    pool,
  };
}

export async function checkDatabaseConnection(client: DatabaseClient): Promise<void> {
  await client.db.execute(sql`select 1`);
}

export async function closeDatabaseClient(client: DatabaseClient): Promise<void> {
  await client.pool.end();
  // pg-pool removes idle clients from its count before their socket end callbacks run.
  // Connections that finished opening during shutdown must also be included.
  const disconnected = [...(connectedClients.get(client.pool) ?? [])].map(
    (connection) => new Promise<void>((resolve) => connection.once("end", () => resolve())),
  );
  await Promise.all(disconnected);
}

export async function migrateDatabaseForTests(
  client: DatabaseClient,
  migrationsFolder: string,
): Promise<void> {
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  await migrate(client.db as never, { migrationsFolder });
}
