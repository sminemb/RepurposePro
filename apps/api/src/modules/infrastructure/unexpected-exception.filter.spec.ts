import { HttpException, Logger } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UnexpectedExceptionFilter } from "../../common/filters/unexpected-exception.filter";

function setup(requestId = "req_filter_test") {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const request = {
    id: requestId,
    method: "POST",
    params: { projectId: "project-safe" },
    route: { path: "/billing/webhook" },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;

  return { host, json, status };
}

describe("UnexpectedExceptionFilter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serializes SQL-shaped unexpected failures into the safe standard envelope", () => {
    const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { host, json, status } = setup();
    const filter = new UnexpectedExceptionFilter();

    filter.catch(new Error("SELECT secret FROM stripe_payments"), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        details: null,
        message: "We could not complete this request.",
        requestId: "req_filter_test",
      },
    });
    expect(error).toHaveBeenCalledWith({
      errorName: "UnexpectedError",
      event: "unexpected_api_error",
      method: "POST",
      requestId: "req_filter_test",
      route: "/billing/webhook",
    });
  });

  it.each([400, 401, 403, 404, 409, 410, 413, 422, 429, 503])(
    "preserves expected HTTP status %s with safe messages",
    (statusCode) => {
      const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
      const { host, json, status } = setup();
      new UnexpectedExceptionFilter().catch(
        new HttpException("SECRET_MARKER /private/path", statusCode),
        host,
      );
      expect(status).toHaveBeenCalledWith(statusCode);
      expect(JSON.stringify(json.mock.calls)).not.toContain("SECRET_MARKER");
      expect(error).not.toHaveBeenCalled();
    },
  );
  it("bounds request IDs and omits raw unmatched paths and invalid identifiers", () => {
    const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const { host, json } = setup("SECRET_MARKER".repeat(20));
    new UnexpectedExceptionFilter().catch(new Error("SECRET_MARKER"), host);
    expect(JSON.stringify(json.mock.calls)).not.toContain("SECRET_MARKER");
    expect(JSON.stringify(error.mock.calls)).not.toContain("SECRET_MARKER");
  });

  it("preserves an existing valid HttpException envelope without wrapping it", () => {
    const { host, json, status } = setup("req_validation");
    const filter = new UnexpectedExceptionFilter();
    const body = {
      error: {
        code: "VALIDATION_FAILED",
        details: null,
        message: "The request is invalid.",
        requestId: "req_validation",
      },
    };

    filter.catch(new HttpException(body, 422), host);

    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith(body);
  });
});
