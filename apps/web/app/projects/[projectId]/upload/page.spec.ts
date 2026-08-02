import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SourceVideoMetadata } from "@repurposepro/shared";

const { getCreditBalanceMock, getSavedSourceVideoMock, getSessionMock, headersMock, redirectMock } =
  vi.hoisted(() => ({
    getCreditBalanceMock: vi.fn(),
    getSavedSourceVideoMock: vi.fn(),
    getSessionMock: vi.fn(),
    headersMock: vi.fn(),
    redirectMock: vi.fn(),
  }));

vi.mock("@/components/app/app-sidebar", () => ({
  AppSidebar: () => createElement("aside", { "data-testid": "app-sidebar" }),
}));
vi.mock("@/components/app/app-topbar", () => ({
  AppTopbar: ({ title }: { title: string }) => createElement("header", null, title),
}));
vi.mock("@/components/app/page-header", () => ({
  PageHeader: ({ description, title }: { description: string; title: string }) =>
    createElement(
      "div",
      null,
      createElement("h1", null, title),
      createElement("p", null, description),
    ),
}));
vi.mock("@/features/billing/server/billing-api", () => ({
  getCreditBalance: getCreditBalanceMock,
}));
vi.mock("@/features/processing/components/processing-start-panel", () => ({
  ProcessingStartPanel: () => createElement("div", { "data-testid": "processing-start-panel" }),
}));
vi.mock("@/features/upload/components/upload-dropzone", () => ({
  UploadDropzone: () => createElement("div", { "data-testid": "upload-dropzone" }),
}));
vi.mock("@/features/upload/components/video-metadata-card", () => ({
  VideoMetadataCard: ({ metadata }: { metadata: SourceVideoMetadata }) =>
    createElement("div", { "data-testid": "saved-video" }, metadata.fileName),
}));
vi.mock("@/features/upload/server/source-video-api", () => ({
  getSavedSourceVideo: getSavedSourceVideoMock,
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: getSessionMock } },
}));
vi.mock("@repurposepro/config", () => ({
  loadWebConfig: () => ({ apiUrl: "http://api.test/api/v1" }),
}));
vi.mock("lucide-react", () => ({
  ArrowLeft: () => null,
  UploadCloud: () => null,
}));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("next/link", () => ({
  default: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import UploadPage from "./page";

const sourceVideo: SourceVideoMetadata = {
  durationSeconds: 60.001,
  expiresAt: "2026-07-20T02:00:00.000Z",
  fileName: "episode.mp4",
  fileSizeBytes: 1024,
  fps: 30,
  hasAudio: true,
  height: 1080,
  id: "video-1",
  requiredCredits: 2,
  width: 1920,
};

async function renderUploadPage(): Promise<string> {
  return renderToStaticMarkup(
    await UploadPage({ params: Promise.resolve({ projectId: "project-1" }) }),
  );
}

describe("UploadPage", () => {
  beforeEach(() => {
    getCreditBalanceMock.mockReset();
    getCreditBalanceMock.mockResolvedValue({ kind: "success", balance: { balance: 10 } });
    getSavedSourceVideoMock.mockReset();
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({ user: { email: "creator@example.com", name: "Creator" } });
    headersMock.mockReset();
    headersMock.mockResolvedValue(new Headers());
    redirectMock.mockReset();
  });

  it("shows the persisted video and processing action when the project is revisited", async () => {
    getSavedSourceVideoMock.mockResolvedValue({ kind: "success", metadata: sourceVideo });

    const page = await renderUploadPage();

    expect(page).toContain('data-testid="saved-video"');
    expect(page).toContain("episode.mp4");
    expect(page).toContain('data-testid="processing-start-panel"');
    expect(page).not.toContain('data-testid="upload-dropzone"');
  });

  it("keeps the upload dropzone available for a project without a source video", async () => {
    getSavedSourceVideoMock.mockResolvedValue({ kind: "missing" });

    const page = await renderUploadPage();

    expect(page).toContain('data-testid="upload-dropzone"');
    expect(page).not.toContain('data-testid="saved-video"');
    expect(page).not.toContain('data-testid="processing-start-panel"');
  });

  it("hides upload controls when it cannot verify the saved video", async () => {
    getSavedSourceVideoMock.mockResolvedValue({
      kind: "unavailable",
      message: "We could not verify your saved video. Refresh the page to try again.",
    });

    const page = await renderUploadPage();

    expect(page).toContain("We could not verify your saved video. Refresh the page to try again.");
    expect(page).not.toContain('data-testid="upload-dropzone"');
    expect(page).not.toContain('data-testid="saved-video"');
    expect(page).not.toContain('data-testid="processing-start-panel"');
  });

  it("redirects to login when the credit balance is unauthenticated", async () => {
    getCreditBalanceMock.mockResolvedValue({ kind: "unauthenticated" });
    getSavedSourceVideoMock.mockResolvedValue({ kind: "missing" });

    await renderUploadPage();

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects to login when the saved video request is unauthenticated", async () => {
    getSavedSourceVideoMock.mockResolvedValue({ kind: "unauthenticated" });
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`redirected to ${path}`);
    });

    await expect(renderUploadPage()).rejects.toThrow("redirected to /login");

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
