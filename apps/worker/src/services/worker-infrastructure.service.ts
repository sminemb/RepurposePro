import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { loadWorkerConfig } from "@repurposepro/config";
import {
  checkDatabaseConnection,
  closeDatabaseClient,
  createDatabaseClient,
  type DatabaseClient,
} from "@repurposepro/db";
import Redis from "ioredis";
import { PinoLogger } from "nestjs-pino";

@Injectable()
export class WorkerInfrastructureService implements OnModuleInit, OnModuleDestroy {
  private readonly database: DatabaseClient;
  private readonly redis: Redis;

  public constructor(private readonly logger: PinoLogger) {
    const config = loadWorkerConfig();
    this.logger.setContext(WorkerInfrastructureService.name);
    this.database = createDatabaseClient({
      connectionString: config.databaseUrl,
      poolMax: config.databasePoolMax,
      ssl: config.databaseSsl,
    });
    this.redis = new Redis(config.redisUrl, {
      connectTimeout: 5_000,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    this.redis.on("error", () => undefined);
  }

  public async onModuleInit(): Promise<void> {
    try {
      await checkDatabaseConnection(this.database);
      await this.redis.connect();
      const redisResponse = await this.redis.ping();

      if (redisResponse !== "PONG") {
        throw new Error("Redis did not return PONG.");
      }

      this.logger.info(
        {
          database: "up",
          redis: "up",
          service: "worker",
        },
        "worker.ready",
      );
    } catch (error: unknown) {
      await Promise.allSettled([closeDatabaseClient(this.database), this.closeRedis()]);
      throw error;
    }
  }

  public async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([closeDatabaseClient(this.database), this.closeRedis()]);
  }

  private async closeRedis(): Promise<void> {
    if (this.redis.status === "end") {
      return;
    }

    if (this.redis.status === "wait") {
      this.redis.disconnect();
      return;
    }

    await this.redis.quit();
  }
}
