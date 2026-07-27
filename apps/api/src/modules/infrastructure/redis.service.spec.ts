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

  it("does not reconnect a client already opened by a dependent provider", async () => {
    const service = new RedisService();
    const connect = vi.spyOn(service.connection, "connect");
    const ping = vi.spyOn(service.connection, "ping").mockResolvedValue("PONG");
    vi.spyOn(service.connection, "status", "get").mockReturnValue("ready");

    await service.onModuleInit();

    expect(connect).not.toHaveBeenCalled();
    expect(ping).toHaveBeenCalledOnce();
  });
});
