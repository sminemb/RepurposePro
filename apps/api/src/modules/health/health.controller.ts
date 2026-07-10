import { Controller, Get, Req } from "@nestjs/common";
import type { ApiSuccess, LiveHealthData, ReadyHealthData } from "@repurposepro/shared";
import type { Request } from "express";

import { HealthService } from "./health.service";

type RequestWithId = Request & { id?: string };

@Controller("health")
export class HealthController {
  public constructor(private readonly healthService: HealthService) {}

  @Get("live")
  public live(): ApiSuccess<LiveHealthData> {
    return this.healthService.live();
  }

  @Get("ready")
  public ready(@Req() request: RequestWithId): Promise<ApiSuccess<ReadyHealthData>> {
    return this.healthService.ready(request.id ?? "req_unknown");
  }
}
