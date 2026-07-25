import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createProcessingStartEndpoint,
  ProcessingRequestError,
  startProcessing,
} from "./processing-api";

afterEach(() => vi.unstubAllGlobals());

describe("startProcessing", () => {
  it("posts the exact confirmation and validates an accepted queued response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          data: {
            creditsCharged: 2,
            jobId: "00000000-0000-4000-8000-000000000802",
            projectId: "00000000-0000-4000-8000-000000000801",
            status: "queued",
          },
        },
        { status: 202 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      startProcessing({
        apiUrl: "http://localhost:4000/api/v1/",
        projectId: "00000000-0000-4000-8000-000000000801",
      }),
    ).resolves.toMatchObject({ creditsCharged: 2, status: "queued" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/projects/00000000-0000-4000-8000-000000000801/analyze",
      {
        body: '{"confirmed":true}',
        credentials: "include",
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
  });

  it("encodes project identifiers in the endpoint", () => {
    expect(createProcessingStartEndpoint("https://api.test/api/v1/", "project/1")).toBe(
      "https://api.test/api/v1/projects/project%2F1/analyze",
    );
  });

  it("rejects a non-202 or malformed success instead of navigating on invented state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ data: { status: "queued" } }, { status: 200 })),
    );

    await expect(
      startProcessing({ apiUrl: "https://api.test", projectId: "project-1" }),
    ).rejects.toMatchObject({ code: "PROCESSING_RESPONSE_INVALID" });
  });

  it.each(["BILLING_INSUFFICIENT_CREDITS", "QUEUE_UNAVAILABLE"])(
    "preserves the recoverable %s API error",
    async (code) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            Response.json(
              { error: { code, message: "Safe recovery message." } },
              { status: code === "QUEUE_UNAVAILABLE" ? 503 : 409 },
            ),
          ),
      );

      const error = await startProcessing({ apiUrl: "https://api.test", projectId: "project-1" })
        .then(() => null)
        .catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(ProcessingRequestError);
      expect(error).toMatchObject({ code, message: "Safe recovery message." });
    },
  );

  it("uses a safe retry message for network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private network detail")));

    await expect(
      startProcessing({ apiUrl: "https://api.test", projectId: "project-1" }),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });
});
