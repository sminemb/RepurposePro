import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import {
  HealthState,
  type ApiSuccess,
  type DependencyHealthChecks,
  type LiveHealthData,
  type ReadyHealthData,
} from "@repurposepro/shared";

import { DatabaseService } from "../infrastructure/database.service";
import { RedisService } from "../infrastructure/redis.service";

@Injectable()
export class HealthService {
  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
  ) {}

  public live(): ApiSuccess<LiveHealthData> {
    return {
      data: {
        service: "api",
        status: "ok",
      },
    };
  }

  public async ready(requestId: string): Promise<ApiSuccess<ReadyHealthData>> {
    const [database, redis] = await Promise.all([
      this.checkDependency(() => this.databaseService.checkConnection()),
      this.checkDependency(() => this.redisService.checkConnection()),
    ]);
    const checks: DependencyHealthChecks = { database, redis };

    if (database === HealthState.Down || redis === HealthState.Down) {
      throw new ServiceUnavailableException({
        error: {
          code: "SERVICE_UNAVAILABLE",
          details: { checks },
          message: "One or more required services are unavailable.",
          requestId,
        },
      });
    }

    return {
      data: {
        checks,
        service: "api",
        status: "ok",
      },
    };
  }

  private async checkDependency(check: () => Promise<void>): Promise<HealthState> {
    try {
      await check();
      return HealthState.Up;
    } catch {
      return HealthState.Down;
    }
  }
}
