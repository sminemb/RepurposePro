import { MulterError } from "multer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UploadExceptionFilter } from "./upload-exception.filter";

describe("UploadExceptionFilter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps Multer's size-limit error to the documented 413 response", () => {
    vi.stubEnv("MAX_UPLOAD_BYTES", "524288000");
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
