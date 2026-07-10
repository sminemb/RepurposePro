import Redis from "ioredis";

import { loadApiConfig } from "@repurposepro/config";
import {
  checkDatabaseConnection,
  closeDatabaseClient,
  createDatabaseClient,
} from "@repurposepro/db";

async function checkInfrastructure(): Promise<void> {
  const config = loadApiConfig();
  const database = createDatabaseClient({
    connectionString: config.databaseUrl,
    poolMax: config.databasePoolMax,
    ssl: config.databaseSsl,
  });
  const redis = new Redis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  redis.on("error", () => undefined);

  try {
    await checkDatabaseConnection(database);
    await redis.connect();
    const redisResponse = await redis.ping();

    if (redisResponse !== "PONG") {
      throw new Error("Redis did not return PONG.");
    }

    process.stdout.write("PostgreSQL: up\nRedis: up\n");
  } finally {
    await Promise.allSettled([closeDatabaseClient(database), redis.quit()]);
  }
}

void checkInfrastructure().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown infrastructure error.";
  process.stderr.write(`Infrastructure check failed: ${message}\n`);
  process.exitCode = 1;
});
