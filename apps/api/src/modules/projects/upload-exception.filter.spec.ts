import { MulterError } from "multer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UploadExceptionFilter } from "./upload-exception.filter";

describe("UploadExceptionFilter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps Multer's size-limit error to the documented 413 response", () => {
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
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ id: "req_upload_test" }),
        getResponse: () => ({ status }),
      }),
    };

    new UploadExceptionFilter().catch(new MulterError("LIMIT_FILE_SIZE"), host as never);

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: "UPLOAD_FILE_TOO_LARGE",
        details: { maxBytes: 524_288_000 },
        message: "This file is larger than 500 MB.",
        requestId: "req_upload_test",
      },
    });
  });
});
