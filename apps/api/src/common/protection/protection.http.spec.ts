import type { INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type * as Config from "@repurposepro/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../../app.module";
import { apiCorsOptions } from "../../cors.config";
import { AuthService } from "../../modules/auth/auth.service";
import { AuthGuard } from "../../modules/auth/auth.guard";
import { DatabaseService } from "../../modules/infrastructure/database.service";
import { ProjectsController } from "../../modules/projects/projects.controller";
import { ProjectsService } from "../../modules/projects/projects.service";
import { ClipEditorController } from "../../modules/projects/clip-editor.controller";
import { ClipEditorService } from "../../modules/projects/clip-editor.service";
import { FramingController } from "../../modules/projects/framing.controller";
import { RenderingController } from "../../modules/rendering/rendering.controller";
import { RenderingService } from "../../modules/rendering/rendering.service";
import { UploadFileInterceptor } from "../../modules/projects/upload-file.interceptor";
import { UploadOwnershipGuard } from "../../modules/projects/upload-ownership.guard";
import { ProtectionGuard } from "./protection.guard";

const state = vi.hoisted(() => ({ root: "", protect: vi.fn() }));
vi.mock("./arcjet-client", () => ({ createProtectionClient: () => ({ protect: state.protect }) }));
vi.mock("@repurposepro/config", async (original) => {
  const config = await original<typeof Config>();
  return {
    ...config,
    loadApiConfig: () => ({
      ...config.loadApiConfig(),
      storageRoot: state.root,
      maxUploadBytes: 32,
    }),
  };
});
const projectId = "00000000-0000-4000-8000-000000003101";
const clipId = "00000000-0000-4000-8000-000000003102";
describe("protection before HTTP side effects", () => {
  let app: INestApplication;
  let base: string;
  const mutation = vi.fn().mockResolvedValue({});
  const query = vi.fn();
  beforeEach(async () => {
    mutation.mockClear();
    query.mockReset();
    query.mockImplementation(async (sql: string) => ({
      rows: sql.includes("SELECT status") ? [{ status: "draft" }] : [{ id: "registered" }],
    }));
    state.root = await mkdtemp(join(tmpdir(), "vs11-http-"));
    state.protect.mockResolvedValue({ isDenied: () => false, isErrored: () => false });
    const module = await Test.createTestingModule({
      controllers: [
        ProjectsController,
        ClipEditorController,
        FramingController,
        RenderingController,
      ],
      providers: [
        { provide: APP_GUARD, useClass: ProtectionGuard },
        AuthGuard,
        {
          provide: AuthService,
          useValue: {
            auth: {
              api: {
                getSession: async () => ({
                  user: { id: "owner", name: "Owner", email: "owner@example.test" },
                }),
              },
            },
          },
        },
        { provide: ProjectsService, useValue: { create: mutation, storeSourceUpload: mutation } },
        { provide: ClipEditorService, useValue: { regenerate: mutation } },
        { provide: RenderingService, useValue: { start: mutation } },
        { provide: DatabaseService, useValue: { database: { pool: { query } } } },
        UploadFileInterceptor,
        UploadOwnershipGuard,
      ],
    }).compile();
    app = module.createNestApplication();
    app.enableCors(apiCorsOptions("http://localhost:3000"));
    await app.listen(0, "127.0.0.1");
    const server = app.getHttpServer() as Server;
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    await app?.close();
    await rm(state.root, { recursive: true, force: true });
  });
  it("registers the production global guard", () => {
    const providers = Reflect.getMetadata("providers", AppModule) as {
      provide: string;
      useClass: unknown;
    }[];
    expect(providers).toContainEqual({ provide: APP_GUARD, useClass: ProtectionGuard });
  });
  it("exposes retry headers to the configured credentialed frontend", async () => {
    state.protect.mockResolvedValue({
      isDenied: () => true,
      isErrored: () => false,
      reason: { isRateLimit: () => true },
    });
    const response = await fetch(`${base}/projects`, {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify({ name: "Blocked", outputType: "clips" }),
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-expose-headers")).toBe("Retry-After,X-Request-Id");
    expect(response.headers.get("retry-after")).toBe("60");
    expect(mutation).not.toHaveBeenCalled();
  });
  it.each([429, 403, 503])(
    "blocks every mutation before upload staging or service calls (%s)",
    async (status) => {
      state.protect.mockResolvedValue(
        status === 503
          ? null
          : {
              isDenied: () => true,
              isErrored: () => false,
              reason: { isRateLimit: () => status === 429 },
            },
      );
      for (const path of [
        "/projects",
        `/projects/${projectId}/upload`,
        `/projects/${projectId}/render`,
        `/projects/${projectId}/clips/${clipId}/regenerate`,
        `/projects/${projectId}/framing-analysis`,
      ]) {
        const form = new FormData();
        form.set("file", new Blob(["media"], { type: "video/mp4" }), "video.mp4");
        const response = await fetch(base + path, { method: "POST", body: form });
        expect(response.status).toBe(status);
        if (status === 429) expect(response.headers.get("retry-after")).toBe("60");
      }
      expect(query).not.toHaveBeenCalled();
      expect(mutation).not.toHaveBeenCalled();
      expect(await readdir(state.root)).toEqual([]);
    },
  );
  it("rejects inaccessible projects before multipart staging", async () => {
    query.mockResolvedValue({ rows: [] });
    const form = new FormData();
    form.set("file", new Blob(["media"], { type: "video/mp4" }), "video.mp4");
    const response = await fetch(`${base}/projects/${projectId}/upload`, {
      method: "POST",
      body: form,
    });
    expect(response.status).toBe(404);
    expect(mutation).not.toHaveBeenCalled();
    expect(await readdir(state.root)).toEqual([]);
  });
  it.each(["field", "second-file", "size", "mime"])("bounds multipart input (%s)", async (kind) => {
    const form = new FormData();
    form.set(
      "file",
      new Blob([kind === "size" ? "x".repeat(33) : "media"], {
        type: kind === "mime" ? "text/plain" : "video/mp4",
      }),
      "video.mp4",
    );
    if (kind === "field") form.set("extra", "untrusted");
    if (kind === "second-file")
      form.append("file", new Blob(["media"], { type: "video/mp4" }), "video.mp4");
    const response = await fetch(`${base}/projects/${projectId}/upload`, {
      method: "POST",
      body: form,
    });
    expect(response.status).toBe(kind === "size" ? 413 : 422);
    expect(mutation).not.toHaveBeenCalled();
    expect(await readdir(join(state.root, ".staging")).catch(() => [])).toEqual([]);
  });
});
