import type { ProjectProcessingStatus } from "@repurposepro/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createProcessingStatusEndpoint,
  loadProcessingStatus,
  ProcessingStatusRequestError,
} from "./processing-status-api";

const projectId = "00000000-0000-4000-8000-000000002001";
const snapshot: ProjectProcessingStatus = {
  currentJob: {
    id: "00000000-0000-4000-8000-000000002002",
    progress: 45,
    status: "active",
    step: "transcribing",
  },
  projectId,
  status: "transcribing",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("processing status client", () => {
  it("builds an encoded project endpoint", () => {
    expect(createProcessingStatusEndpoint("http://localhost:3001/api/v1/", "project / one")).toBe(
      "http://localhost:3001/api/v1/projects/project%20%2F%20one/status",
    );
  });

  it("loads an authenticated, uncached status snapshot", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: snapshot }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();

    await expect(
      loadProcessingStatus("http://localhost:3001/api/v1", projectId, controller.signal),
    ).resolves.toEqual(snapshot);
    expect(fetch).toHaveBeenCalledWith(
      `http://localhost:3001/api/v1/projects/${projectId}/status`,
      expect.objectContaining({ cache: "no-store", credentials: "include" }),
    );
  });

  it("rejects malformed and unsuccessful responses", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetch);

    await expect(
      loadProcessingStatus("http://localhost:3001/api/v1", projectId, new AbortController().signal),
    ).rejects.toBeInstanceOf(ProcessingStatusRequestError);
    await expect(
      loadProcessingStatus("http://localhost:3001/api/v1", projectId, new AbortController().signal),
    ).rejects.toBeInstanceOf(ProcessingStatusRequestError);
  });
});
