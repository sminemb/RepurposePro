import { Writable } from "node:stream";
import { createServer } from "node:http";
import pino, { type LoggerOptions } from "pino";
import pinoHttp, { type Options } from "pino-http";
import { describe, expect, it } from "vitest";
import { loadApiConfig, loadWorkerConfig, safeRequestId } from "@repurposepro/config";
import { createLoggingConfig } from "../../logging.config";
import { createLoggingConfig as workerLogging } from "../../../../worker/src/logging.config";

describe("production log serialization", () => {
  it("sanitizes actual HTTP completion logs and request bindings", async () => {
    let captured = "";
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        captured += chunk.toString();
        callback();
      },
    });
    const config = createLoggingConfig({ ...loadApiConfig(), logPretty: false });
    const middleware = pinoHttp(
      { ...(config.pinoHttp as unknown as Options), level: "info" },
      stream,
    );
    const server = createServer((request, response) => {
      middleware(request, response);
      response.statusCode = 503;
      response.setHeader("set-cookie", "SECRET_MARKER");
      response.end("SECRET_MARKER");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing HTTP fixture port.");
      const response = await fetch(
        `http://127.0.0.1:${address.port}/SECRET_MARKER?token=SECRET_MARKER`,
        {
          method: "POST",
          headers: {
            authorization: "SECRET_MARKER",
            cookie: "SECRET_MARKER",
            "x-request-id": "SECRET_MARKER".repeat(10),
          },
          body: "SECRET_MARKER",
        },
      );
      await response.text();
      expect(response.headers.get("x-request-id")).toMatch(/^req_[0-9a-f-]+$/);
      expect(captured).not.toContain("SECRET_MARKER");
      expect(captured).toContain("request_failed");
      expect(captured).toContain('"statusCode":503');
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
  it.each(["api", "worker"])(
    "excludes injected credentials, payloads and private paths (%s)",
    (target) => {
      const marker = "SECRET_MARKER";
      let captured = "";
      const stream = new Writable({
        write(chunk: Buffer, _encoding, callback) {
          captured += chunk.toString();
          callback();
        },
      });
      const config =
        target === "api"
          ? createLoggingConfig({ ...loadApiConfig(), logPretty: false })
          : workerLogging({ ...loadWorkerConfig(), logPretty: false });
      const options = config.pinoHttp as unknown as LoggerOptions;
      const logger = pino({ ...options, level: "info" }, stream);
      logger.info(
        {
          event: "processing_stage",
          step: "selecting",
          jobId: "00000000-0000-4000-8000-000000003101",
          req: {
            id: "req_test",
            method: "POST",
            url: `/private/${marker}?token=${marker}`,
            headers: { authorization: marker, cookie: marker },
            body: marker,
          },
          res: { statusCode: 503, headers: { "set-cookie": marker } },
          err: new Error(marker),
          transcript: marker,
          providerPayload: { secret: marker },
          path: marker,
          password: marker,
          nested: { cookie: marker },
        },
        "safe_stage",
      );
      expect(captured).not.toContain(marker);
      expect(captured).toContain("processing_stage");
      expect(captured).toContain("selecting");
      expect(captured).toContain("00000000-0000-4000-8000-000000003101");
    },
  );
  it("allows only bounded request IDs", () => {
    expect(safeRequestId("req_test-123")).toBe("req_test-123");
    for (const value of ["x".repeat(65), "newline\n", "path/secret", ["header"]])
      expect(safeRequestId(value)).toBeUndefined();
  });
});
