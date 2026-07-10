import { ServiceUnavailableException } from "@nestjs/common";
import { HealthState } from "@repurposepro/shared";
import { describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../infrastructure/database.service";
import type { RedisService } from "../infrastructure/redis.service";
import { HealthService } from "./health.service";

function createService(options?: { databaseFails?: boolean; redisFails?: boolean }): HealthService {
  const databaseService = {
    checkConnection: options?.databaseFails
      ? vi.fn().mockRejectedValue(new Error("database unavailable"))
      : vi.fn().mockResolvedValue(undefined),
  } as unknown as DatabaseService;
  const redisService = {
    checkConnection: options?.redisFails
      ? vi.fn().mockRejectedValue(new Error("redis unavailable"))
      : vi.fn().mockResolvedValue(undefined),
  } as unknown as RedisService;

  return new HealthService(databaseService, redisService);
}

describe("HealthService", () => {
  it("returns the stable liveness envelope", () => {
    expect(createService().live()).toEqual({
      data: {
        service: "api",
        status: "ok",
      },
    });
  });

  it("reports ready when PostgreSQL and Redis are available", async () => {
    await expect(createService().ready("req_test")).resolves.toEqual({
      data: {
        checks: {
          database: HealthState.Up,
          redis: HealthState.Up,
        },
        service: "api",
        status: "ok",
      },
    });
  });

  it("returns the documented 503 error envelope when a dependency is down", async () => {
    const service = createService({ redisFails: true });

    try {
      await service.ready("req_failure");
      throw new Error("Expected readiness to fail.");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      const response = (error as ServiceUnavailableException).getResponse();
      expect(response).toEqual({
        error: {
          code: "SERVICE_UNAVAILABLE",
          details: {
            checks: {
              database: HealthState.Up,
              redis: HealthState.Down,
            },
          },
          message: "One or more required services are unavailable.",
          requestId: "req_failure",
        },
      });
    }
  });
});
