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
    vi.stubEnv("FFPROBE_PATH", "ffprobe");
    vi.stubEnv("FILE_RETENTION_DAYS", "7");
    vi.stubEnv("ARCJET_KEY", "ajkey_checkout_test");
    vi.stubEnv("ARCJET_MODE", "DRY_RUN");
    vi.stubEnv("MAX_UPLOAD_BYTES", "524288000");
    vi.stubEnv("MAX_VIDEO_DURATION_SECONDS", "1800");
    vi.stubEnv("STRIPE_CANCEL_URL", "http://localhost:3000/billing?checkout=cancelled");
    vi.stubEnv("STRIPE_CREATOR_PRICE_ID", "price_creatorcheckouttest");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_procheckouttest");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_checkout");
    vi.stubEnv("STRIPE_STARTER_PRICE_ID", "price_startercheckouttest");
    vi.stubEnv("STRIPE_SUCCESS_URL", "http://localhost:3000/billing?checkout=success");
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
