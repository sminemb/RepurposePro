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
      errorName: "Error",
      event: "unexpected_api_error",
      method: "POST",
      projectId: "project-safe",
      requestId: "req_filter_test",
      route: "/billing/webhook",
    });
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
