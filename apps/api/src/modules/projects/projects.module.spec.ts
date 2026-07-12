import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { AuthGuard } from "../auth/auth.guard";
import { DatabaseService } from "../infrastructure/database.service";
import { RedisService } from "../infrastructure/redis.service";
import { ProjectsController } from "./projects.controller";
import { ProjectsModule } from "./projects.module";

describe("ProjectsModule", () => {
  it("resolves the protected projects controller and AuthGuard", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProjectsModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({ database: {} })
      .overrideProvider(RedisService)
      .useValue({})
      .compile();

    expect(moduleRef.get(ProjectsController)).toBeInstanceOf(ProjectsController);
    expect(moduleRef.get(AuthGuard)).toBeInstanceOf(AuthGuard);

    await moduleRef.close();
  });
});
