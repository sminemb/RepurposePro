import { afterEach, describe, expect, it, vi } from "vitest";
import { startProcessing } from "./processing-api";
import { regenerateClip } from "../../clips/client/clip-management-api";
import { startClipRender } from "../../rendering/client/render-api";
import { uploadVideo } from "../../upload/client/upload-video";

afterEach(() => vi.unstubAllGlobals());

describe("protected action retry messages", () => {
  const actions = [
    () => startProcessing({ apiUrl: "/api", projectId: "project" }),
    () => regenerateClip("/api", "project", "clip", 0, "same-attempt"),
    () =>
      startClipRender(
        "/api",
        "project",
        { type: "clips", clipIds: ["clip"], expectedRevision: 0 },
        "same-attempt",
      ),
  ];
  it.each(actions)(
    "shows the server retry interval without exposing its message",
    async (action) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockImplementation(() =>
            Promise.resolve(
              Response.json(
                { error: { code: "RATE_LIMIT_EXCEEDED", message: "SECRET_MARKER" } },
                { status: 429, headers: { "Retry-After": "45" } },
              ),
            ),
          ),
      );
      await expect(action()).rejects.toThrow("Too many attempts. Wait 45 seconds and try again.");
    },
  );
  it.each(actions)("gives temporary outage guidance", async (action) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: { code: "PROTECTION_UNAVAILABLE" } }, { status: 503 }),
        ),
    );
    await expect(action()).rejects.toThrow("is temporarily unavailable. Try again shortly.");
  });
  it("uses the upload response code and Retry-After", async () => {
    class Request extends EventTarget {
      upload = new EventTarget();
      status = 429;
      withCredentials = false;
      responseText = JSON.stringify({
        error: { code: "RATE_LIMIT_EXCEEDED", message: "SECRET_MARKER" },
      });
      open() {}
      getResponseHeader() {
        return "30";
      }
      send() {
        this.dispatchEvent(new Event("load"));
      }
    }
    vi.stubGlobal("XMLHttpRequest", Request);
    await expect(
      uploadVideo({
        apiUrl: "/api",
        projectId: "project",
        file: new File(["fixture"], "fixture.mp4"),
        onProgress: () => {},
      }),
    ).rejects.toThrow("Too many attempts. Wait 30 seconds and try again.");
  });
});
