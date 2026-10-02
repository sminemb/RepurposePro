import { createServer } from "node:http";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import { PROCESSING_FAILURES, type ProjectProcessingStatus } from "@repurposepro/shared";

const root = resolve("storage/vs9-verification/browser");
const projectId = "00000000-0000-4000-8000-000000000090";
const originalJobId = "00000000-0000-4000-8000-000000000091";
const nextJobId = "00000000-0000-4000-8000-000000000092";
const apiPath = `/api/projects/${projectId}`;
const fixtureRequire = createRequire(realpathSync(resolve("node_modules/tsx/package.json")));
const { build } = fixtureRequire("esbuild") as {
  build: (options: Record<string, unknown>) => Promise<unknown>;
};

async function main() {
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, "link.tsx"),
    "export default function Link(props){return <a {...props}/>;}",
  );
  await writeFile(
    join(root, "navigation.ts"),
    "const router={push(url){history.pushState({},'',url)},replace(url){history.replaceState({},'',url)},refresh(){}};export function useRouter(){return router;}",
  );
  await writeFile(
    join(root, "entry.tsx"),
    `import {createRoot} from '${resolve("apps/web/node_modules/react-dom/client").replaceAll("\\", "/")}';import {LiveProcessingPanel} from '${resolve("apps/web/features/processing/components/live-processing-panel").replaceAll("\\", "/")}';const initial=await(await fetch('/fixture/reset'+location.search)).json();createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:px-10 lg:py-12"><LiveProcessingPanel apiUrl="/api" projectId="${projectId}" initialSnapshot={initial.data}/></main>);`,
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
  let settled = false,
    restarted = false,
    unavailable = false,
    insufficient = false;
  let mode: "clips" | "summary" = "clips";
  const requests: { method: string; path: string; body?: unknown }[] = [];
  const snapshot = (): ProjectProcessingStatus => ({
    projectId,
    outputType: mode,
    status: restarted ? "queued" : settled ? "refunded" : "analyzing",
    currentJob: {
      id: restarted ? nextJobId : originalJobId,
      status: restarted ? "queued" : settled ? "refunded" : "active",
      step: restarted ? "queued" : settled ? "failed" : "analyzing",
      progress: restarted ? 0 : null,
      failure: restarted
        ? null
        : {
            code: "WHISPER_FAILED",
            message: PROCESSING_FAILURES.WHISPER_FAILED.message,
            refundStatus: settled ? "completed" : "pending",
            refundedCredits: settled ? 11 : 0,
            refundCompletedAt: settled ? "2026-10-02T13:00:00.000Z" : null,
          },
    },
  });
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><title>VS9 recovery verification</title><style>body{margin:0;background:#0b0d12;color:#f5f6f8;font-family:Arial}</style></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>';
  createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://localhost");
      const method = request.method ?? "GET";
      const send = (data: unknown, status = 200) => {
        response.statusCode = status;
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ data }));
      };
      if (url.pathname === "/fixture/reset") {
        settled = url.searchParams.has("completed");
        restarted = false;
        unavailable = url.searchParams.has("unavailable");
        insufficient = url.searchParams.has("insufficient");
        mode = url.searchParams.has("summary") ? "summary" : "clips";
        requests.length = 0;
        send(snapshot());
        return;
      }
      if (url.pathname === "/fixture/settle") {
        settled = true;
        send(snapshot());
        return;
      }
      if (url.pathname === "/fixture/evidence") {
        send({ requests, snapshot: snapshot() });
        return;
      }
      const entry: { method: string; path: string; body?: unknown } = {
        method,
        path: url.pathname,
      };
      if (method === "POST") {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(chunk as Buffer);
        entry.body = JSON.parse(Buffer.concat(chunks).toString());
      }
      requests.push(entry);
      if (url.pathname === apiPath + "/status") {
        send(snapshot());
        return;
      }
      if (url.pathname === apiPath + "/video") {
        send({
          durationSeconds: 600.001,
          requiredCredits: 11,
          hasAudio: true,
          expiresAt: "2099-01-01T00:00:00Z",
          fileName: "source.mp4",
          fileSizeBytes: 1024,
          fps: 30,
          height: 1080,
          width: 1920,
          id: projectId,
        });
        return;
      }
      if (url.pathname === "/api/billing/credits") {
        send({
          balance: insufficient ? 1 : restarted ? 489 : settled ? 500 : 489,
          unit: "credits",
          conversion: "1 credit = 1 video minute",
        });
        return;
      }
      if (url.pathname === apiPath + "/source-video/content") {
        response.statusCode = unavailable ? 404 : 200;
        response.end();
        return;
      }
      if (url.pathname === apiPath + "/analyze") {
        if (
          !settled ||
          insufficient ||
          unavailable ||
          !(entry.body as { confirmed?: boolean })?.confirmed
        ) {
          send(null, 409);
          return;
        }
        restarted = true;
        send({ projectId, jobId: nextJobId, status: "queued", creditsCharged: 11 }, 202);
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
    })().catch(() => {
      response.statusCode = 500;
      response.end("Fixture failed");
    });
  }).listen(4189, "127.0.0.1", () => console.log("VS9 browser fixture http://127.0.0.1:4189"));
}
void main().catch(() => {
  console.error("VS9 browser fixture failed to start.");
  process.exitCode = 1;
});
