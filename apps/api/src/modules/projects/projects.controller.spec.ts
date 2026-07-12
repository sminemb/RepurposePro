import type { ProjectSummary } from "@repurposepro/shared";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequest } from "../auth/auth.guard";
import { ProjectsController } from "./projects.controller";
import type { ProjectsService } from "./projects.service";

const request = {
  id: "req_project_test",
  user: { email: "creator@example.com", id: "user_1", name: "Creator" },
} as AuthenticatedRequest;

const project: ProjectSummary = {
  clipCount: 0,
  createdAt: "2026-07-12T09:06:00.000Z",
  expiresAt: null,
  id: "f5e14a5f-6d36-4449-a9c3-5e5c67a5344e",
  name: "Creator breakdown",
  outputType: "clips",
  status: "draft",
};

describe("ProjectsController", () => {
  it("creates a draft project for the authenticated user only", async () => {
    const create = vi.fn().mockResolvedValue(project);
    const controller = new ProjectsController({ create } as unknown as ProjectsService);

    await expect(controller.create({ name: " Creator breakdown ", outputType: "clips" }, request)).resolves.toEqual({
      data: project,
    });
    expect(create).toHaveBeenCalledWith("user_1", { name: "Creator breakdown", outputType: "clips" });
  });

  it("lists only the authenticated user's projects with validated filters", async () => {
    const list = vi.fn().mockResolvedValue({ data: [project], meta: { nextCursor: null } });
    const controller = new ProjectsController({ list } as unknown as ProjectsService);

    await expect(controller.list({ limit: "5", outputType: "clips", status: "draft" }, request)).resolves.toEqual({
      data: [project],
      meta: { nextCursor: null },
    });
    expect(list).toHaveBeenCalledWith("user_1", { limit: 5, outputType: "clips", status: "draft" });
  });

  it("returns the standard validation error envelope for invalid input", async () => {
    const controller = new ProjectsController({} as ProjectsService);
    const error = await controller
      .create({ name: "", outputType: "clips" }, request)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        details: null,
        message: "Project name must be between 1 and 120 characters.",
        requestId: "req_project_test",
      },
    });
  });
});
