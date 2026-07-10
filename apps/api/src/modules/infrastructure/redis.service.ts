import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client: Redis;

  public constructor() {
    const config = loadApiConfig();
    this.client = new Redis(config.redisUrl, {
      connectTimeout: 5_000,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    this.client.on("error", () => undefined);
  }

  public async onModuleInit(): Promise<void> {
    await this.client.connect();
    await this.checkConnection();
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.client.status === "end") {
      return;
    }

    if (this.client.status === "wait") {
      this.client.disconnect();
      return;
    }

    await this.client.quit();
  }

  public async checkConnection(): Promise<void> {
    const response = await this.client.ping();

    if (response !== "PONG") {
      throw new Error("Redis did not return PONG.");
    }
  }
}
