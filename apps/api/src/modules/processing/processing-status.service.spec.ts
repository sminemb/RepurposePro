import { describe, expect, it, vi } from "vitest";

import type {
  ProcessingStatusRecord,
  ProcessingStatusRepositoryContract,
} from "./processing-status.repository";
import { ProcessingStatusError, ProcessingStatusService } from "./processing-status.service";

const projectId = "00000000-0000-4000-8000-000000000701";
const jobId = "00000000-0000-4000-8000-000000000702";

function record(overrides: Partial<ProcessingStatusRecord> = {}): ProcessingStatusRecord {
  return {
    currentJobId: jobId,
    currentJobProgress: null,
    currentJobReferenceId: jobId,
    currentJobStatus: "queued",
    currentJobStep: "queued",
    projectId,
    projectStatus: "queued",
    ...overrides,
  };
}

function setup(result: ProcessingStatusRecord | null = record()) {
  const get = vi.fn<ProcessingStatusRepositoryContract["get"]>().mockResolvedValue(result);
  return {
    get,
    service: new ProcessingStatusService({ get }),
  };
}

describe("ProcessingStatusService", () => {
  it("returns the persisted queued job without inventing progress", async () => {
    const { get, service } = setup();

    await expect(service.get("user-1", projectId)).resolves.toEqual({
      currentJob: {
        id: jobId,
        progress: null,
        status: "queued",
        step: "queued",
      },
      projectId,
      status: "queued",
    });
    expect(get).toHaveBeenCalledWith("user-1", projectId);
  });

  it("treats the database's queued zero sentinel as no progress estimate", async () => {
    const { service } = setup(record({ currentJobProgress: 0 }));

    await expect(service.get("user-1", projectId)).resolves.toMatchObject({
      currentJob: { progress: null, status: "queued" },
    });
  });

  it("returns a project with no current job as an explicit null", async () => {
    const { service } = setup(
      record({
        currentJobId: null,
        currentJobProgress: null,
        currentJobReferenceId: null,
        currentJobStatus: null,
        currentJobStep: null,
        projectStatus: "uploaded",
      }),
    );

    await expect(service.get("user-1", projectId)).resolves.toEqual({
      currentJob: null,
      projectId,
      status: "uploaded",
    });
  });

  it("conceals missing and foreign projects behind the same not-found error", async () => {
    const { service } = setup(null);

    const error = await service.get("user-1", projectId).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ProcessingStatusError);
    expect(error).toMatchObject({ code: "PROJECT_NOT_FOUND", statusCode: 404 });
  });

  it.each([
    ["dangling current job", record({ currentJobId: null })],
    ["unknown project status", record({ projectStatus: "private_status" })],
    ["unknown job status", record({ currentJobStatus: "private_status" })],
    ["unknown job step", record({ currentJobStep: "private_step" })],
    ["invalid progress", record({ currentJobProgress: 101 })],
  ])("fails closed for %s", async (_scenario, malformed) => {
    const { service } = setup(malformed);

    const error = await service.get("user-1", projectId).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ProcessingStatusError);
    expect(error).toMatchObject({ code: "PROCESSING_STATUS_UNAVAILABLE", statusCode: 503 });
  });

  it("maps database failures to a safe unavailable error", async () => {
    const get = vi
      .fn<ProcessingStatusRepositoryContract["get"]>()
      .mockRejectedValue(new Error("private database failure"));
    const service = new ProcessingStatusService({ get });

    const error = await service.get("user-1", projectId).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ProcessingStatusError);
    expect(error).toMatchObject({ code: "PROCESSING_STATUS_UNAVAILABLE", statusCode: 503 });
    expect((error as Error).message).toBe("We could not load this project's processing status.");
  });
});
