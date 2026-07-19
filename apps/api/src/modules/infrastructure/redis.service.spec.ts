import { describe, expect, it, vi } from "vitest";

vi.mock("@repurposepro/config", () => ({
  loadApiConfig: () => ({ redisUrl: "redis://localhost:6379" }),
}));

import { RedisService } from "./redis.service";

describe("RedisService", () => {
  it("disables the offline command queue for fail-fast producers", async () => {
    const service = new RedisService();

    expect(service.connection.options.enableOfflineQueue).toBe(false);

    await service.onModuleDestroy();
  });
});
