import { describe, expect, it } from "vitest";
import type { AuthenticatedRequest } from "../auth/auth.guard";
import { AdminController } from "./admin.controller";
import type { AdminService } from "./admin.service";
const request = { id: "req_admin" } as AuthenticatedRequest;
describe("admin endpoint error boundaries", () => {
  it("returns bounded empty lists", async () => {
    const controller = new AdminController({
      list: async () => ({ data: [], meta: { nextCursor: null } }),
    } as unknown as AdminService);
    await expect(controller.users({}, request)).resolves.toEqual({
      data: [],
      meta: { nextCursor: null },
    });
  });
  it("rejects malformed requests before data access", async () => {
    const controller = new AdminController({} as AdminService);
    await expect(controller.overview({ range: "bad" }, request)).rejects.toMatchObject({
      status: 400,
    });
    await expect(controller.users({ cursor: "invalid" }, request)).rejects.toMatchObject({
      status: 400,
    });
    await expect(controller.search({ q: "partial name" }, request)).rejects.toMatchObject({
      status: 400,
    });
  });
  it("sanitizes dependency errors and handles absent records", async () => {
    const controller = new AdminController({
      overview: async () => {
        throw new Error("secret SQL/provider/path");
      },
      detail: async () => null,
    } as unknown as AdminService);
    const error = (await controller.overview({}, request).catch((reason: unknown) => reason)) as {
      getResponse: () => unknown;
      getStatus: () => number;
    };
    expect(error.getStatus()).toBe(503);
    expect(JSON.stringify(error.getResponse())).not.toContain("secret");
    await expect(controller.project("missing-id", request)).rejects.toMatchObject({ status: 404 });
  });
});
