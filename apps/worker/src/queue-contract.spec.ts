import { describe, expect, it, vi } from "vitest";
import { framingQueueId, resourceQueuePayload, validateCleanupQueue } from "./queue-contract";
import { FramingService } from "./services/framing.service";
import { CleanupWorkerService } from "./services/cleanup-worker.service";
import { RenderWorkerService } from "./services/render-worker.service";
import { ClipRegenerationProcessor } from "./processors/clip-regeneration.processor";

const id = "00000000-0000-4000-8000-000000003101";
const projectId = "00000000-0000-4000-8000-000000003102";
describe("queue ingress contracts", () => {
  it("accepts supported names and exact durable identifiers", () => {
    expect(
      resourceQueuePayload({ id, name: "render", data: { jobId: id, projectId } }, ["render"]),
    ).toEqual({ jobId: id, projectId });
    expect(framingQueueId({ id, name: "track_faces", data: { id } })).toBe(id);
    expect(() =>
      validateCleanupQueue({ id: "startup-123", name: "cleanup_expired_project_files", data: {} }),
    ).not.toThrow();
  });
  it.each([null, [], { id: 123 }, { id, path: "secret" }, { id: projectId }])(
    "rejects malformed framing before database work (%j)",
    async (data) => {
      const query = vi.fn();
      const service = new FramingService({ pool: { query } } as never, {} as never, {} as never);
      await expect(service.processQueue({ id, name: "track_faces", data })).rejects.toThrow();
      expect(query).not.toHaveBeenCalled();
    },
  );
  it.each([null, [], { path: "secret" }, { userId: id }])(
    "rejects malformed cleanup before sweeping (%j)",
    async (data) => {
      const query = vi.fn();
      const service = new CleanupWorkerService({ pool: { query } } as never, {} as never);
      await expect(
        service.processQueue({ id: "startup-1", name: "cleanup_expired_project_files", data }),
      ).rejects.toThrow();
      expect(query).not.toHaveBeenCalled();
    },
  );
  it.each([
    null,
    [],
    { jobId: id, projectId, path: "secret" },
    { jobId: projectId, projectId },
    { jobId: id, projectId: "bad" },
  ])("rejects render/regeneration before database work (%j)", async (data) => {
    const query = vi.fn();
    const db = { pool: { query } };
    await expect(
      new RenderWorkerService(db as never, {} as never).process({
        id,
        name: "render_clip_batch",
        data,
      }),
    ).rejects.toThrow();
    await expect(
      new ClipRegenerationProcessor(db as never, {} as never).process({
        id,
        name: "regenerate_clip_candidate",
        data,
      }),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
  it("rejects unknown job names and prototype-bearing payloads", () => {
    expect(() =>
      resourceQueuePayload({ id, name: "exec", data: { jobId: id, projectId } }, ["render"]),
    ).toThrow();
    expect(() =>
      resourceQueuePayload(
        { id, name: "render", data: Object.assign(new Date(), { jobId: id, projectId }) },
        ["render"],
      ),
    ).toThrow();
    expect(() => framingQueueId({ id, name: "exec", data: { id } })).toThrow();
    expect(() => validateCleanupQueue({ id, name: "exec", data: {} })).toThrow();
  });
});
