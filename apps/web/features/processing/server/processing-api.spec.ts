import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestApiMock } = vi.hoisted(() => ({ requestApiMock: vi.fn() }));

vi.mock("@/lib/server-api", () => ({ requestApi: requestApiMock }));
vi.mock("server-only", () => ({}));

import { getProjectProcessingStatus } from "./processing-api";

describe("getProjectProcessingStatus", () => {
  beforeEach(() => requestApiMock.mockReset());

  it("returns the persisted snapshot from the encoded endpoint", async () => {
    requestApiMock.mockResolvedValue(
      Response.json({
        data: {
          currentJob: {
            id: "00000000-0000-4000-8000-000000000802",
            progress: null,
            status: "queued",
            step: "queued",
          },
          projectId: "project/1",
          status: "queued",
        },
      }),
    );

    await expect(getProjectProcessingStatus("project/1")).resolves.toMatchObject({
      kind: "success",
      snapshot: { status: "queued" },
    });
    expect(requestApiMock).toHaveBeenCalledWith("/projects/project%2F1/status");
  });

  it("rejects malformed API state instead of supplying defaults", async () => {
    requestApiMock.mockResolvedValue(
      Response.json({ data: { currentJob: { status: "queued" }, status: "queued" } }),
    );

    await expect(getProjectProcessingStatus("project-1")).resolves.toMatchObject({
      kind: "unavailable",
    });
  });

  it.each([
    [401, "unauthenticated"],
    [404, "not_found"],
    [503, "unavailable"],
  ])("maps status %s to %s", async (status, kind) => {
    requestApiMock.mockResolvedValue(Response.json({ error: {} }, { status }));

    await expect(getProjectProcessingStatus("project-1")).resolves.toMatchObject({ kind });
  });
});
