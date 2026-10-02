import { createServer } from "node:http";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import {
  clipEditorSchema,
  summaryStateSchema,
  outputListSchema,
  summaryEditSchema,
} from "@repurposepro/shared";

// Real production components with deterministic API responses; database evidence is separate.
const root = resolve("storage/vs10-verification/browser");
const project = "00000000-0000-4000-8000-000000000100";
const analysis = "00000000-0000-4000-8000-000000000101";
const clipId = "00000000-0000-4000-8000-000000000102";
const base = `/api/projects/${project}`;
const fixtureRequire = createRequire(realpathSync(resolve("node_modules/tsx/package.json")));
const { build } = fixtureRequire("esbuild") as {
  build(this: void, options: Record<string, unknown>): Promise<unknown>;
};
const clip = clipEditorSchema.parse({
  clip: {
    id: clipId,
    rank: 0,
    title: "Retained clip",
    startTime: 1,
    endTime: 5,
    captionStyle: "hormozi",
    captionsEnabled: true,
    crop: null,
    previewFontSize: 48,
    score: 0.9,
    captionLines: [],
    captionPosition: { x: 0.5, y: 0.72 },
    revision: 0,
    selected: true,
  },
  baseline: [],
  captionEdits: [],
  sourceDurationSeconds: 60,
});
let summary = summaryStateSchema.parse({
  analysisJobId: analysis,
  revision: 0,
  sourceDurationSeconds: 60,
  targetDurationSeconds: 10,
  currentDurationSeconds: 10,
  segments: [
    {
      id: clipId,
      order: 0,
      startTime: 1,
      endTime: 11,
      durationSeconds: 10,
      reason: "Keep the main idea",
      selected: true,
    },
  ],
});
let deadline = new Date(Date.now() - 60000).toISOString();
let transition = new Date(Date.now() + 60000).toISOString();
const requests: { method: string; path: string }[] = [];
let currentView = "";
const processingSnapshot = () => ({
  projectId: project,
  outputType: "clips",
  status: "refunded",
  currentJob: {
    id: analysis,
    status: "refunded",
    step: "failed",
    progress: null,
    failure: {
      code: "STORAGE_FAILED",
      message: "The source video expired before processing could finish.",
      refundStatus: "completed",
      refundedCredits: 1,
      refundCompletedAt: new Date().toISOString(),
    },
  },
});

async function main() {
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, "link.tsx"),
    "export default function Link(props){return <a {...props}/>;}",
  );
  await writeFile(
    join(root, "navigation.ts"),
    "const router={push(){},replace(){},refresh(){}};export function useRouter(){return router;}",
  );
  const module = (path: string) => resolve(`apps/web/${path}`).replaceAll("\\", "/");
  await writeFile(
    join(root, "entry.tsx"),
    `
import {createRoot} from '${resolve("apps/web/node_modules/react-dom/client").replaceAll("\\", "/")}';
import {ExpirationBadge} from '${module("components/app/expiration-badge")}';
import {OutputBrowser} from '${module("features/rendering/components/output-browser")}';
import {SummaryPreviewEditor} from '${module("features/summary/components/summary-preview-editor")}';
import {ClipPreviewEditor} from '${module("features/clips/components/clip-preview-editor")}';
import {ProcessingStartPanel} from '${module("features/processing/components/processing-start-panel")}';
import {VideoMetadataCard} from '${module("features/upload/components/video-metadata-card")}';
import {ProjectList} from '${module("features/projects/components/project-list")}';
import {LiveProcessingPanel} from '${module("features/processing/components/live-processing-panel")}';
const fixture=await(await fetch('/fixture'+location.search)).json(); const p=new URLSearchParams(location.search); const view=p.get('view');
createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-7xl p-5 sm:p-8"><h1 className="mb-6 text-2xl font-bold">File retention</h1><section className="mb-6 flex flex-col gap-3" aria-label="Expiration levels">{fixture.badges.map((expiresAt,i)=><ExpirationBadge key={i} expiresAt={expiresAt} label={['Normal','Warning','Urgent','Expired'][i]}/>)}</section>{view==='projects'?<ProjectList projects={fixture.projects}/>:view==='processing'?<LiveProcessingPanel apiUrl="/api" projectId="${project}" initialSnapshot={fixture.processing}/>:view==='summary'?<SummaryPreviewEditor initial={fixture.summary} apiUrl="/api" projectId="${project}" userId="fixture-owner"/>:view==='clips'?<ClipPreviewEditor apiUrl="/api" projectId="${project}" userId="fixture-owner" clips={[fixture.clip.clip]}/>:view==='upload'?<><VideoMetadataCard metadata={fixture.metadata}/><ProcessingStartPanel apiUrl="/api" projectId="${project}" metadata={fixture.metadata} balance={{balance:100,unit:'credits',conversion:'1 credit = 1 video minute'}} balanceError={null}/></>:<OutputBrowser apiUrl="/api" projectId="${project}"/>}</main>);
`,
  );
  await build({
    entryPoints: [join(root, "entry.tsx")],
    outfile: join(root, "bundle.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    jsx: "automatic",
    nodePaths: [resolve("apps/web/node_modules")],
    alias: {
      "next/link": join(root, "link.tsx"),
      "next/navigation": join(root, "navigation.ts"),
      "@": resolve("apps/web"),
    },
    tsconfig: resolve("apps/web/tsconfig.json"),
  });
  const metadata = () => ({
    id: analysis,
    fileName: "source.mp4",
    durationSeconds: 60,
    fileSizeBytes: 10,
    fps: 30,
    width: 1920,
    height: 1080,
    hasAudio: true,
    requiredCredits: 1,
    expiresAt: deadline,
    deletedAt: Date.parse(deadline) <= Date.now() ? new Date().toISOString() : null,
    status: Date.parse(deadline) <= Date.now() ? "expired" : "available",
  });
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><title>VS10 retention verification</title><style>body{margin:0;background:#0b0d12;color:#f5f6f8;font-family:Arial}</style></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>';
  createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://localhost"),
        method = request.method ?? "GET";
      const send = (data: unknown, status = 200) => {
        response.statusCode = status;
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ data }));
      };
      if (url.pathname === "/fixture") {
        currentView = url.searchParams.get("view") ?? "";
        deadline = new Date(
          Date.now() +
            (url.searchParams.has("transition")
              ? 8000
              : url.searchParams.has("fresh")
                ? 86400000
                : -60000),
        ).toISOString();
        transition = new Date(Date.now() + 8000).toISOString();
        requests.length = 0;
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            metadata: metadata(),
            summary,
            clip,
            processing: processingSnapshot(),
            projects: [
              {
                id: project,
                name: "Retained project",
                outputType: "clips",
                status: "completed",
                clipCount: 1,
                createdAt: new Date().toISOString(),
                expiresAt: deadline,
              },
              {
                id: analysis,
                name: "Draft project",
                outputType: "summary",
                status: "draft",
                clipCount: 0,
                createdAt: new Date().toISOString(),
                expiresAt: null,
              },
            ],
            badges: [172800000, 7200000, 1800000, -1000].map((ms) =>
              new Date(Date.now() + ms).toISOString(),
            ),
          }),
        );
        return;
      }
      if (url.pathname === "/evidence") {
        send(requests);
        return;
      }
      if (url.pathname.startsWith("/api/")) requests.push({ method, path: url.pathname });
      if (url.pathname === base + "/video") {
        send(metadata());
        return;
      }
      if (url.pathname === base + "/status") {
        send(
          currentView === "processing"
            ? processingSnapshot()
            : { projectId: project, outputType: "clips", status: "completed", currentJob: null },
        );
        return;
      }
      if (url.pathname === base + "/outputs") {
        send(
          outputListSchema.parse(
            ["Expired clip", "Later summary", "Deadline transition"].map((title, i) => ({
              id: `00000000-0000-4000-8000-00000000010${i + 3}`,
              renderJobId: analysis,
              clipId: i === 0 ? clipId : null,
              type: i === 0 ? "clip" : "summary",
              title,
              durationSeconds: 4,
              fileSizeBytes: 10,
              width: 1080,
              height: 1920,
              status: i === 0 ? "expired" : "ready",
              createdAt: new Date().toISOString(),
              expiresAt:
                i === 0
                  ? new Date(Date.now() - 60000).toISOString()
                  : i === 1
                    ? new Date(Date.now() + 86400000).toISOString()
                    : transition,
              deletedAt: i === 0 ? new Date().toISOString() : null,
            })),
          ),
        );
        return;
      }
      if (url.pathname === base + "/clips/" + clipId) {
        send(clip);
        return;
      }
      if (url.pathname === base + "/summary") {
        if (method === "PATCH") {
          const chunks: Buffer[] = [];
          for await (const chunk of request) chunks.push(chunk as Buffer);
          const input = summaryEditSchema.parse(JSON.parse(Buffer.concat(chunks).toString()));
          summary = {
            ...summary,
            revision: summary.revision + 1,
            segments: input.segments.map((s, i) => ({
              ...s,
              order: i,
              durationSeconds: s.endTime - s.startTime,
              reason: summary.segments[i]!.reason,
            })),
            currentDurationSeconds: input.segments
              .filter((s) => s.selected)
              .reduce((sum, s) => sum + s.endTime - s.startTime, 0),
          };
        }
        send(summary);
        return;
      }
      if (url.pathname.endsWith("/source-video/content")) {
        response.statusCode = Date.parse(deadline) <= Date.now() ? 410 : 204;
        response.end();
        return;
      }
      if (url.pathname.endsWith("/framing-analysis")) {
        send({ status: "missing", data: null });
        return;
      }
      if (url.pathname === "/bundle.js") {
        response.setHeader("Content-Type", "application/javascript");
        response.end(await readFile(join(root, "bundle.js")));
        return;
      }
      if (url.pathname === "/styles.css") {
        const directory = resolve("apps/web/.next/static/chunks");
        response.setHeader("Content-Type", "text/css");
        response.end(
          (
            await Promise.all(
              (await readdir(directory))
                .filter((f) => f.endsWith(".css"))
                .map((f) => readFile(join(directory, f), "utf8")),
            )
          ).join("\n"),
        );
        return;
      }
      response.setHeader("Content-Type", "text/html");
      response.end(html);
    })().catch(() => {
      response.statusCode = 500;
      response.end("Fixture failed");
    });
  }).listen(4190, "127.0.0.1", () => console.log("VS10 browser fixture http://127.0.0.1:4190"));
}
void main().catch(() => {
  console.error("VS10 fixture failed to start.");
  process.exitCode = 1;
});
