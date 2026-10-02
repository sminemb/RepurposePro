import { describe, it, expect, vi } from "vitest";
import { FramingController } from "./framing.controller";
import type { DatabaseService } from "../infrastructure/database.service";
import type { AuthenticatedRequest } from "../auth/auth.guard";

describe("FramingController", () => {
  it("reports expiration with HTTP 410 while preserving the error code", async () => {
    const { controller } = setup({ error: "SOURCE_VIDEO_EXPIRED" });
    await expect(controller.start(project, request)).rejects.toMatchObject({
      status: 410,
      response: { error: { code: "SOURCE_VIDEO_EXPIRED" } },
    });
  });
  const project = "00000000-0000-4000-8000-000000000001";
  const request = { user: { id: "owner" } } as AuthenticatedRequest;
  const setup = (result: unknown) => {
    const query = vi.fn().mockResolvedValue({ rows: [{ result }] });
    return {
      query,
      controller: new FramingController({
        database: { pool: { query } },
      } as unknown as DatabaseService),
    };
  };
  it("starts tracking through the ownership-scoped function", async () => {
    const { controller, query } = setup({ status: "queued", data: null });
    expect(await controller.start(project, request)).toEqual({
      data: { status: "queued", data: null },
    });
    expect(query.mock.calls[0]?.[1]).toEqual(["owner", project, true]);
  });
  it("does not start work during a status read", async () => {
    const { controller, query } = setup({ status: "missing", data: null });
    await controller.get(project, request);
    expect(query.mock.calls[0]?.[1]).toEqual(["owner", project, false]);
  });
  it("rejects unauthenticated, invalid, and unavailable projects", async () => {
    const { controller, query } = setup(null);
    await expect(controller.start(project, {} as AuthenticatedRequest)).rejects.toMatchObject({
      status: 401,
    });
    await expect(controller.start("invalid", request)).rejects.toMatchObject({ status: 400 });
    expect(query).not.toHaveBeenCalled();
    await expect(controller.get(project, request)).rejects.toMatchObject({ status: 404 });
  });
});
