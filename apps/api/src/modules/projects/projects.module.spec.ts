import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthGuard } from "../auth/auth.guard";
import { DatabaseService } from "../infrastructure/database.service";
import { RedisService } from "../infrastructure/redis.service";
import { LocalStorageService } from "../storage/local-storage.service";
import { ProjectsController } from "./projects.controller";
import { ProjectsModule } from "./projects.module";
import { UploadFileInterceptor } from "./upload-file.interceptor";

describe("ProjectsModule", () => {
  beforeEach(() => {
    vi.stubEnv("MAX_UPLOAD_BYTES", "524288000");
    vi.stubEnv("STORAGE_DRIVER", "local");
    vi.stubEnv("STORAGE_ROOT", "./storage");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves the protected projects controller and AuthGuard", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProjectsModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({ database: {} })
      .overrideProvider(RedisService)
      .useValue({})
      .overrideProvider(LocalStorageService)
      .useValue({})
      .overrideProvider(UploadFileInterceptor)
      .useValue({})
      .compile();

    expect(moduleRef.get(ProjectsController)).toBeInstanceOf(ProjectsController);
    expect(moduleRef.get(AuthGuard)).toBeInstanceOf(AuthGuard);

    await moduleRef.close();
  });
});
