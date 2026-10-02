import { createServer } from "node:http";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import {
  summaryStateSchema,
  summaryEditSchema,
  validateSummaryEdits,
  outputMetadataSchema,
} from "@repurposepro/shared";
import { runMedia } from "../apps/worker/src/services/render-ffmpeg";
import { summaryFilter } from "../apps/worker/src/services/summary-renderer.service";
const root = resolve("storage/vs8-verification/browser"),
  projectId = "00000000-0000-4000-8000-000000000080",
  jobId = "00000000-0000-4000-8000-000000000081";
const apiPath = `/api/projects/${projectId}`;
const fixtureRequire = createRequire(realpathSync(resolve("node_modules/tsx/package.json")));
const { build } = fixtureRequire("esbuild") as {
  build: (options: Record<string, unknown>) => Promise<unknown>;
};
async function main() {
  await mkdir(root, { recursive: true });
  const source = join(root, "source.mp4"),
    output = join(root, "summary.mp4");
  await runMedia(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=640x360:rate=30:duration=20",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=20",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-c:a",
      "aac",
      "-shortest",
      source,
    ],
    { timeoutMs: 30000 },
  );
  let state = summaryStateSchema.parse({
    analysisJobId: "00000000-0000-4000-8000-000000000082",
    revision: 0,
    sourceDurationSeconds: 20,
    targetDurationSeconds: 2,
    currentDurationSeconds: 2,
    segments: [
      {
        id: "00000000-0000-4000-8000-000000000083",
        order: 0,
        startTime: 1,
        endTime: 2,
        durationSeconds: 1,
        reason: "Introduce the main idea with necessary context.",
        selected: true,
      },
      {
        id: "00000000-0000-4000-8000-000000000084",
        order: 1,
        startTime: 10,
        endTime: 11,
        durationSeconds: 1,
        reason: "Keep the strongest explanation and conclusion.",
        selected: true,
      },
    ],
  });
  await writeFile(join(root, "summary.filter"), summaryFilter(state.segments, 640, 360));
  await runMedia(
    "ffmpeg",
    [
      "-y",
      "-i",
      source,
      "-filter_complex_script",
      "summary.filter",
      "-map",
      "[vout]",
      "-map",
      "[aout]",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-c:a",
      "aac",
      output,
    ],
    { cwd: root, timeoutMs: 30000 },
  );
  await writeFile(
    join(root, "link.tsx"),
    "export default function Link(props){return <a {...props}/>;}",
  );
  await writeFile(
    join(root, "entry.tsx"),
    `import {createRoot} from '${resolve("apps/web/node_modules/react-dom/client").replaceAll("\\", "/")}';import {SummaryPreviewEditor} from '${resolve("apps/web/features/summary/components/summary-preview-editor").replaceAll("\\", "/")}';import {OutputBrowser} from '${resolve("apps/web/features/rendering/components/output-browser").replaceAll("\\", "/")}';const fixture=await(await fetch('${apiPath}/summary')).json();createRoot(document.getElementById('root')).render(<main style={{maxWidth:1440,margin:'auto',padding:24}}><h1 style={{fontSize:28,fontWeight:700,marginBottom:24}}>Your summary editor</h1>{location.pathname.endsWith('outputs')?<OutputBrowser apiUrl="/api" projectId="${projectId}"/>:<SummaryPreviewEditor apiUrl="/api" projectId="${projectId}" userId="fixture-owner" initial={fixture.data}/>}</main>);`,
  );
  await build({
    entryPoints: [join(root, "entry.tsx")],
    outfile: join(root, "bundle.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    jsx: "automatic",
    nodePaths: [resolve("apps/web/node_modules")],
    alias: { "next/link": join(root, "link.tsx"), "@": resolve("apps/web") },
    tsconfig: resolve("apps/web/tsconfig.json"),
  });
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>body{margin:0;background:#0b0d12;color:#f5f6f8;font-family:Arial}</style></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>';
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  let rendering = false,
    polls = 0;
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://localhost"),
        referer = new URL(request.headers.referer ?? url.href),
        method = request.method ?? "GET";
      const send = (data: unknown, status = 200) => {
        response.statusCode = status;
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ data }));
      };
      let body: unknown;
      if (method === "PATCH" || method === "POST") {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(chunk as Buffer);
        body = JSON.parse(Buffer.concat(chunks).toString());
        requests.push({ method, path: url.pathname, body });
        await writeFile(join(root, "requests.json"), JSON.stringify(requests, null, 2));
      }
      if (url.pathname === "/requests.json") {
        send(requests);
        return;
      }
      if (url.pathname === "/fixture-reset") {
        state = {
          ...state,
          revision: 0,
          currentDurationSeconds: 2,
          segments: state.segments.map((s, i) => ({
            ...s,
            startTime: i ? 10 : 1,
            endTime: i ? 11 : 2,
            durationSeconds: 1,
            selected: true,
          })),
        };
        rendering = false;
        polls = 0;
        send(state);
        return;
      }
      if (url.pathname === apiPath + "/summary") {
        if (method === "PATCH") {
          const input = summaryEditSchema.parse(body);
          if (referer.searchParams.has("conflict") || input.expectedRevision !== state.revision) {
            response.statusCode = 409;
            response.end(
              JSON.stringify({
                error: {
                  message:
                    "This summary changed elsewhere. Reload the saved version before continuing.",
                },
              }),
            );
            return;
          }
          const next = state.segments.map((s) => ({
            ...s,
            ...input.segments.find((x) => x.id === s.id),
          }));
          if (!validateSummaryEdits(next, 20)) {
            response.statusCode = 409;
            response.end(JSON.stringify({ error: { message: "Invalid summary ranges" } }));
            return;
          }
          state = {
            ...state,
            revision: state.revision + 1,
            segments: next.map((s) => ({ ...s, durationSeconds: s.endTime - s.startTime })),
            currentDurationSeconds: next
              .filter((s) => s.selected)
              .reduce((sum, s) => sum + s.endTime - s.startTime, 0),
          };
        }
        send(state);
        return;
      }
      if (url.pathname === apiPath + "/render") {
        rendering = true;
        polls = 0;
        send({ jobId, status: "queued", outputCount: 1 }, 202);
        return;
      }
      if (url.pathname === apiPath + "/status") {
        const failed = referer.searchParams.has("failure");
        const active = !failed && rendering && ++polls < 3;
        send({
          projectId,
          outputType: "summary",
          status: active
            ? "rendering"
            : failed
              ? "preview_ready"
              : rendering
                ? "completed"
                : "preview_ready",
          currentJob: {
            id: jobId,
            status: active ? "active" : failed ? "failed" : "completed",
            step: active ? "rendering" : failed ? "failed" : "completed",
            progress: active ? 50 : 100,
          },
        });
        return;
      }
      if (url.pathname === `/api/jobs/${jobId}/status`) {
        const failed = referer.searchParams.has("failure");
        send({
          id: jobId,
          status: failed ? "failed" : polls < 3 ? "active" : "completed",
          step: failed ? "failed" : polls < 3 ? "rendering" : "completed",
          progress: polls < 3 ? 50 : 100,
          message: failed ? "Summary export failed. Your saved edits are safe." : null,
          startedAt: new Date().toISOString(),
          completedAt: polls < 3 ? null : new Date().toISOString(),
        });
        return;
      }
      if (url.pathname === apiPath + "/outputs") {
        send(
          rendering
            ? [
                outputMetadataSchema.parse({
                  id: "00000000-0000-4000-8000-000000000085",
                  renderJobId: jobId,
                  clipId: null,
                  type: "summary",
                  title: "Chronological summary",
                  durationSeconds: 2,
                  fileSizeBytes: (await stat(output)).size,
                  width: 640,
                  height: 360,
                  status: referer.searchParams.has("expired") ? "expired" : "ready",
                  createdAt: new Date().toISOString(),
                  expiresAt: new Date(
                    Date.now() + (referer.searchParams.has("expired") ? -1000 : 7 * 86400000),
                  ).toISOString(),
                }),
              ]
            : [],
        );
        return;
      }
      if (
        url.pathname === apiPath + "/source-video/content" ||
        url.pathname.endsWith("/download")
      ) {
        const media = await readFile(url.pathname.endsWith("/download") ? output : source);
        response.setHeader("Content-Type", "video/mp4");
        response.setHeader("Accept-Ranges", "bytes");
        const m = /bytes=(\d+)-(\d*)/.exec(request.headers.range ?? "");
        if (m) {
          const start = Number(m[1]),
            end = Math.min(Number(m[2] || media.length - 1), media.length - 1);
          response.statusCode = 206;
          response.setHeader("Content-Range", `bytes ${start}-${end}/${media.length}`);
          response.end(media.subarray(start, end + 1));
        } else response.end(media);
        return;
      }
      if (url.pathname === "/bundle.js") {
        response.setHeader("Content-Type", "application/javascript");
        response.end(await readFile(join(root, "bundle.js")));
        return;
      }
      if (url.pathname === "/styles.css") {
        const directory = resolve("apps/web/.next/static/chunks");
        const files = (await readdir(directory)).filter((f) => f.endsWith(".css"));
        response.setHeader("Content-Type", "text/css");
        response.end(
          (await Promise.all(files.map((f) => readFile(join(directory, f), "utf8")))).join("\n"),
        );
        return;
      }
      response.setHeader("Content-Type", "text/html");
      response.end(html);
    })().catch((error) => {
      console.error(error);
      response.statusCode = 500;
      response.end("Fixture failed");
    });
  });
  server.listen(4188, "127.0.0.1", () => console.log("VS8 browser fixture http://127.0.0.1:4188"));
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
