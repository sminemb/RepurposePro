import type Redis from "ioredis";
import { describe, expect, it, vi } from "vitest";

import {
  BullMqConnectionFactory,
  redisReconnectDelay,
  type BullMqConnectionFactoryDependencies,
} from "./bullmq-connection.factory";

function fakeRedis() {
  const quit = vi.fn().mockResolvedValue("OK");
  const client = {
    disconnect: vi.fn(),
    on: vi.fn(),
    quit,
    status: "ready",
  } as unknown as Redis;
  return { client, quit };
}

describe("BullMqConnectionFactory", () => {
  it("uses bounded jittered reconnects and fail-fast producer commands", () => {
    const clients = [fakeRedis(), fakeRedis()];
    const createClient = vi
      .fn<BullMqConnectionFactoryDependencies["createClient"]>()
      .mockReturnValueOnce(clients[0]!.client)
      .mockReturnValueOnce(clients[1]!.client);
    const factory = new BullMqConnectionFactory({
      createClient,
      random: () => 0.5,
      redisUrl: "redis://localhost:6379",
    });

    expect(factory.createProducer()).toBe(clients[0]!.client);
    expect(factory.createBlockingConsumer()).toBe(clients[1]!.client);
    const producerOptions = createClient.mock.calls[0]?.[1];
    const blockingOptions = createClient.mock.calls[1]?.[1];
    expect(createClient.mock.calls[0]?.[0]).toBe("redis://localhost:6379");
    expect(producerOptions).toMatchObject({
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    expect(typeof producerOptions?.retryStrategy).toBe("function");
    expect(createClient.mock.calls[1]?.[0]).toBe("redis://localhost:6379");
    expect(blockingOptions).toMatchObject({ maxRetriesPerRequest: null });
    expect(typeof blockingOptions?.retryStrategy).toBe("function");
    expect(redisReconnectDelay(1, () => 0.5)).toBeGreaterThanOrEqual(100);
    expect(redisReconnectDelay(100, () => 0.5)).toBeLessThanOrEqual(5_000);
  });

  it("closes every owned connection exactly once", async () => {
    const producer = fakeRedis();
    const blocking = fakeRedis();
    const createClient = vi
      .fn<BullMqConnectionFactoryDependencies["createClient"]>()
      .mockReturnValueOnce(producer.client)
      .mockReturnValueOnce(blocking.client);
    const factory = new BullMqConnectionFactory({
      createClient,
      random: () => 0.5,
      redisUrl: "redis://localhost:6379",
    });

    factory.createProducer();
    factory.createBlockingConsumer();
    await factory.close(producer.client);
    await factory.close(producer.client);
    await factory.onModuleDestroy();

    expect(producer.quit).toHaveBeenCalledOnce();
    expect(blocking.quit).toHaveBeenCalledOnce();
  });
});
