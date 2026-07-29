import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";
import Redis from "ioredis";

import { redisReconnectDelay } from "./bullmq-connection.factory";

export class RedisInitializationError extends Error {
  public constructor(cause: unknown) {
    super("Redis initialization failed.", { cause });
    this.name = "RedisInitializationError";
  }
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client: Redis;

  public constructor() {
    const config = loadApiConfig();
    this.client = new Redis(config.redisUrl, {
      connectTimeout: 5_000,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: redisReconnectDelay,
    });
    this.client.on("error", () => undefined);
  }

  public async onModuleInit(): Promise<void> {
    try {
      await this.connect();
      await this.checkConnection();
    } catch (error) {
      throw new RedisInitializationError(error);
    }
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

  private async connect(): Promise<void> {
    if (this.client.status === "ready") {
      return;
    }

    if (this.client.status === "wait") {
      await this.client.connect();
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        this.client.off("error", reject);
        this.client.off("ready", resolve);
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onReady = () => {
        cleanup();
        resolve();
      };

      this.client.once("error", onError);
      this.client.once("ready", onReady);
    });
  }

  public get connection(): Redis {
    return this.client;
  }
}
