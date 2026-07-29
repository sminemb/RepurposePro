import { Inject, Injectable, Optional, type OnModuleDestroy } from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";
import Redis, { type RedisOptions } from "ioredis";

export const BULLMQ_CONNECTION_FACTORY_DEPENDENCIES = Symbol(
  "BULLMQ_CONNECTION_FACTORY_DEPENDENCIES",
);

export interface BullMqConnectionFactoryDependencies {
  readonly createClient: (redisUrl: string, options: RedisOptions) => Redis;
  readonly random: () => number;
  readonly redisUrl: string;
}

const defaultDependencies = (): BullMqConnectionFactoryDependencies => ({
  createClient: (redisUrl, options) => new Redis(redisUrl, options),
  random: Math.random,
  redisUrl: loadApiConfig().redisUrl,
});

export function redisReconnectDelay(attempt: number, random: () => number = Math.random): number {
  const boundedAttempt = Math.max(1, Math.min(attempt, 7));
  const exponentialDelay = Math.min(200 * 2 ** (boundedAttempt - 1), 5_000);
  const jitter = 0.5 + Math.min(Math.max(random(), 0), 1) * 0.5;
  return Math.max(100, Math.floor(exponentialDelay * jitter));
}

@Injectable()
export class BullMqConnectionFactory implements OnModuleDestroy {
  private readonly dependencies: BullMqConnectionFactoryDependencies;
  private readonly ownedConnections = new Set<Redis>();

  public constructor(
    @Optional()
    @Inject(BULLMQ_CONNECTION_FACTORY_DEPENDENCIES)
    dependencies?: BullMqConnectionFactoryDependencies,
  ) {
    this.dependencies = dependencies ?? defaultDependencies();
  }

  public createProducer(): Redis {
    return this.createConnection({
      commandTimeout: 1_000,
      connectTimeout: 5_000,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => redisReconnectDelay(attempt, this.dependencies.random),
    });
  }

  public createBlockingConsumer(): Redis {
    return this.createConnection({
      connectTimeout: 5_000,
      lazyConnect: true,
      maxRetriesPerRequest: null,
      retryStrategy: (attempt) => redisReconnectDelay(attempt, this.dependencies.random),
    });
  }

  public async close(connection: Redis): Promise<void> {
    if (!this.ownedConnections.delete(connection)) {
      return;
    }

    if (connection.status === "end") {
      return;
    }

    if (connection.status === "wait") {
      connection.disconnect();
      return;
    }

    try {
      await connection.quit();
    } catch {
      connection.disconnect();
    }
  }

  public async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.ownedConnections].map((connection) => this.close(connection)));
  }

  private createConnection(options: RedisOptions): Redis {
    const connection = this.dependencies.createClient(this.dependencies.redisUrl, options);
    connection.on("error", () => undefined);
    this.ownedConnections.add(connection);
    return connection;
  }
}
