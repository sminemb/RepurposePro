import { createServer, type ServerResponse } from "node:http";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import {
  clipEditorSchema,
  clipEditInputSchema,
  clipPreviewCandidateSchema,
  clipRevisionInputSchema,
  clipSelectionInputSchema,
  framingStatusSchema,
  outputListSchema,
  projectCaptionLines,
  projectClipListSchema,
  validateClipEdit,
  type ClipEditor,
} from "@repurposepro/shared";

// Synthetic API and media fixtures exercise production components, not real jobs or billing.
const root = resolve("storage/vs7-verification");
const sourceRoot = resolve("storage/vs6-verification/manual");
const projectId = "00000000-0000-4000-8000-000000000070";
const clipIds = ["00000000-0000-4000-8000-000000000071", "00000000-0000-4000-8000-000000000072"];
const replacementId = "00000000-0000-4000-8000-000000000073";
const jobId = "00000000-0000-4000-8000-000000000074";
const apiPath = `/api/projects/${projectId}`;
const fixtureRequire = createRequire(realpathSync(resolve("node_modules/tsx/package.json")));
const { build } = fixtureRequire("esbuild") as {
  build: (options: Record<string, unknown>) => Promise<unknown>;
};

async function main() {
  const preview = JSON.parse(await readFile(join(sourceRoot, "preview.json"), "utf8")) as {
    clip: unknown;
  };
  const source = clipPreviewCandidateSchema.parse(preview.clip);
  const sourceVideo = await readFile(join(sourceRoot, "source.mp4"));
  const editors = new Map<string, ClipEditor>();
  for (const [index, id] of clipIds.entries()) {
    const baseline = source.captionLines.map((line, lineIndex) => ({
      ...line,
      id: `generated-${lineIndex}`,
    }));
    editors.set(
      id,
      clipEditorSchema.parse({
        clip: {
          ...source,
          id,
          title: index ? "A second useful moment" : "A great idea",
          rank: index,
          revision: index ? 7 : 4,
          selected: true,
        },
        baseline,
        captionEdits: [],
        sourceDurationSeconds: 3,
      }),
    );
  }
  const requests: Array<{
    method: string;
    path: string;
    body: unknown;
    idempotencyKey: string | null;
  }> = [];
  let renderedIds = [...clipIds];
  let rendering = false;
  let regenerating = false;
  let regenerationTarget = "";
  let regenerationPolls = 0;
  const send = (response: ServerResponse, data: unknown, status = 200) => {
    response.statusCode = status;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ data }));
  };
  const fail = (response: ServerResponse, message: string, status = 409) => {
    response.statusCode = status;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: { code: "FIXTURE_ERROR", message } }));
  };
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, "next-link.tsx"),
    'export default function Link({href,...props}) { return <a {...props} href={href.includes("outputs")?"/?outputs=1"+location.search.replace("?","&"):"/"}/>; }',
  );
  await writeFile(
    join(root, "next-navigation.ts"),
    'export function useRouter(){return {push:(path)=>location.assign("/?outputs=1"+location.search.replace("?","&")),refresh:()=>location.reload()}}',
  );
  await writeFile(
    join(root, "entry.tsx"),
    `
import {createRoot} from '${resolve("apps/web/node_modules/react-dom/client").replaceAll("\\", "/")}';
import {ClipPreviewEditor} from '${resolve("apps/web/features/clips/components/clip-preview-editor").replaceAll("\\", "/")}';
import {OutputBrowser} from '${resolve("apps/web/features/rendering/components/output-browser").replaceAll("\\", "/")}';
const params=new URLSearchParams(location.search);
const fixture=await (await fetch('${apiPath}/clips')).json();
createRoot(document.getElementById('root')).render(<main style={{maxWidth:1440,margin:'auto',padding:24}}><h1 style={{fontSize:28,fontWeight:700,marginBottom:24}}>{params.has('outputs')?'Your exports':'Review your clips'}</h1>{params.has('outputs')?<OutputBrowser apiUrl="/api" projectId="${projectId}"/>:<ClipPreviewEditor apiUrl="/api" projectId="${projectId}" userId="fixture-owner" clips={fixture.data.clips}/>}</main>);
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
      "next/link": join(root, "next-link.tsx"),
      "next/navigation": join(root, "next-navigation.ts"),
      "@": resolve("apps/web"),
    },
    tsconfig: resolve("apps/web/tsconfig.json"),
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><style>@font-face{font-family:'RP Caption';src:url('/fonts/Inter-Black.ttf');font-weight:900;font-display:block}body{margin:0;background:#0b0d12;color:#f5f6f8;font-family:Arial}</style></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>`;
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://localhost");
      const parameters = new URL(request.headers.referer ?? url.href).searchParams;
      const mode = parameters.get("mode") ?? (parameters.has("regenfail") ? "regenfail" : "");
      const method = request.method ?? "GET";
      let body: unknown = null;
      if (["POST", "PATCH", "DELETE"].includes(method)) {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(chunk as Buffer);
        const text = Buffer.concat(chunks).toString();
        body = text ? JSON.parse(text) : null;
      }
      if (url.pathname.startsWith("/api/"))
        requests.push({
          method,
          path: url.pathname,
          body,
          idempotencyKey:
            typeof request.headers["idempotency-key"] === "string"
              ? request.headers["idempotency-key"]
              : null,
        });
      if (url.pathname === "/") {
        response.setHeader("Content-Type", "text/html");
        response.end(html);
        return;
      }
      if (url.pathname === "/requests.json") {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(requests));
        return;
      }
      if (url.pathname === "/styles.css") {
        const directory = resolve("apps/web/.next/static/chunks");
        const files = (await readdir(directory)).filter((file) => file.endsWith(".css"));
        response.setHeader("Content-Type", "text/css");
        response.end(
          (await Promise.all(files.map((file) => readFile(join(directory, file), "utf8")))).join(
            "\n",
          ),
        );
        return;
      }
      if (url.pathname === `${apiPath}/clips` && method === "GET") {
        send(
          response,
          projectClipListSchema.parse({
            projectId,
            sourceDurationSeconds: 3,
            clips: [...editors.values()].map((editor) => editor.clip),
          }),
        );
        return;
      }
      if (url.pathname === `${apiPath}/framing-analysis`) {
        send(
          response,
          framingStatusSchema.parse({
            status: "completed",
            data: { version: "mediapipe-v1", width: 1920, height: 1080, tracks: [] },
          }),
        );
        return;
      }
      const clipMatch =
        /^\/api\/projects\/[^/]+\/clips\/([^/]+)(?:\/(selection|regenerate))?$/.exec(url.pathname);
      if (clipMatch) {
        const id = clipMatch[1]!;
        const editor = editors.get(id);
        if (!editor) {
          fail(response, "This clip is no longer available.", 404);
          return;
        }
        if (method === "GET") {
          send(response, editor);
          return;
        }
        if (method === "PATCH" && clipMatch[2] === "selection") {
          const input = clipSelectionInputSchema.parse(body);
          const next = clipEditorSchema.parse({
            ...editor,
            clip: { ...editor.clip, selected: input.selected },
          });
          editors.set(id, next);
          send(response, next.clip);
          return;
        }
        const revision = clipRevisionInputSchema.safeParse(body);
        if (method === "DELETE" || clipMatch[2] === "regenerate") {
          if (!revision.success || revision.data.expectedRevision !== editor.clip.revision) {
            fail(response, "This clip was changed elsewhere. Reload and try again.");
            return;
          }
          if (method === "DELETE") {
            editors.delete(id);
            response.statusCode = 204;
            response.end();
            return;
          }
          if (mode === "regenfail") {
            fail(response, "Could not regenerate this clip. Your saved clip is safe.", 503);
            return;
          }
          regenerating = mode.startsWith("queued");
          regenerationTarget = id;
          regenerationPolls = 0;
          if (regenerating)
            editors.set(id, { ...editor, clip: { ...editor.clip, regenerationJobId: jobId } });
          if (!regenerating) {
            // Deterministic backup promotion; no model, transcription, queue or credits involved.
            editors.delete(id);
            editors.set(
              replacementId,
              clipEditorSchema.parse({
                ...editor,
                clip: {
                  ...editor.clip,
                  id: replacementId,
                  title: "A fresh replacement moment",
                  revision: 0,
                  selected: true,
                },
              }),
            );
          }
          send(
            response,
            regenerating
              ? { jobId, status: "queued", source: "gemini_regeneration" }
              : { replacementClipId: replacementId, source: "backup_candidate" },
            regenerating ? 202 : 200,
          );
          return;
        }
        if (method === "PATCH") {
          const input = clipEditInputSchema.parse(body);
          if (input.expectedRevision !== editor.clip.revision) {
            fail(response, "This clip was changed elsewhere. Reload and try again.");
            return;
          }
          if (validateClipEdit(input, editor.baseline, editor.sourceDurationSeconds)) {
            fail(response, "Check your trim and caption settings.", 400);
            return;
          }
          const { expectedRevision, captionEdits, ...settings } = input;
          const next = clipEditorSchema.parse({
            ...editor,
            captionEdits,
            clip: {
              ...editor.clip,
              ...settings,
              revision: expectedRevision + 1,
              captionLines: projectCaptionLines(editor.baseline, input),
            },
          });
          editors.set(id, next);
          send(response, next);
          return;
        }
      }
      if (url.pathname === `${apiPath}/render` && method === "POST") {
        const input = body as {
          clipIds?: string[];
          expectedRevision?: number;
          expectedRevisions?: Record<string, number>;
        };
        const selectedIds = input.clipIds ?? [];
        if (!selectedIds.length || selectedIds.some((id) => !editors.has(id))) {
          fail(response, "Choose at least one saved clip.", 400);
          return;
        }
        if (
          selectedIds.some(
            (id) =>
              (input.expectedRevisions?.[id] ?? input.expectedRevision) !==
              editors.get(id)!.clip.revision,
          )
        ) {
          fail(response, "A selected clip changed. Reload before exporting.");
          return;
        }
        renderedIds = [...selectedIds];
        rendering = true;
        send(response, { jobId, status: "queued", outputCount: renderedIds.length }, 202);
        return;
      }
      if (
        url.pathname === `${apiPath}/status` ||
        /^\/api\/jobs\/[^/]+\/status$/.test(url.pathname)
      ) {
        let state =
          parameters.get("state") ??
          (regenerating ? "queued" : rendering ? "rendering" : "completed");
        if (regenerating && mode === "queuedfinish" && ++regenerationPolls >= 2)
          state = "completed";
        const regenerationJob = regenerating;
        if (regenerationJob && (state === "completed" || state === "failed")) {
          const original = editors.get(regenerationTarget)!;
          if (state === "completed") {
            editors.delete(regenerationTarget);
            editors.set(replacementId, {
              ...original,
              clip: {
                ...original.clip,
                id: replacementId,
                title: "A fresh replacement moment",
                revision: 0,
                regenerationJobId: null,
              },
            });
          } else
            editors.set(regenerationTarget, {
              ...original,
              clip: { ...original.clip, regenerationJobId: null },
            });
          regenerating = false;
        }
        const completed = state === "completed" && mode !== "partial" && mode !== "publishing";
        const failed = state === "failed" || mode === "partial";
        const job = {
          id: jobId,
          status: completed
            ? "completed"
            : failed
              ? "failed"
              : state === "queued"
                ? "queued"
                : "active",
          step: state,
          progress: completed ? 100 : state === "queued" ? 0 : state === "saving_output" ? 97 : 42,
          message: failed
            ? regenerationJob
              ? "A replacement could not be found. Your original clip is safe; try again."
              : "Some clips failed. Successful downloads are ready."
            : null,
          ...(regenerationJob && completed ? { replacementClipId: replacementId } : {}),
          startedAt: state === "queued" ? null : "2026-10-01T00:00:00.000Z",
          completedAt: completed || failed ? "2026-10-01T00:01:00.000Z" : null,
          clips: regenerationJob
            ? undefined
            : renderedIds.map((clipId, index) => ({
                clipId,
                title: editors.get(clipId)?.clip.title ?? "Saved clip",
                status:
                  (mode === "partial" || mode === "publishing") && !index
                    ? "completed"
                    : completed
                      ? "completed"
                      : failed
                        ? "failed"
                        : index
                          ? "queued"
                          : "active",
                step:
                  (mode === "partial" || mode === "publishing") && !index
                    ? "completed"
                    : completed
                      ? "completed"
                      : failed
                        ? "failed"
                        : index
                          ? "rendering"
                          : "rendering",
                progress:
                  completed || ((mode === "partial" || mode === "publishing") && !index)
                    ? 100
                    : index
                      ? 42
                      : 84,
              })),
        };
        send(
          response,
          url.pathname === `${apiPath}/status`
            ? {
                projectId,
                status: completed ? "completed" : failed ? "preview_ready" : "rendering",
                currentJob: job,
              }
            : job,
        );
        return;
      }
      if (url.pathname === `${apiPath}/outputs`) {
        const now = Date.now();
        send(
          response,
          outputListSchema.parse(
            renderedIds
              .filter((_, index) => !["partial", "publishing"].includes(mode) || index === 0)
              .map((id, index) => ({
                id: `00000000-0000-4000-8000-${String(80 + index).padStart(12, "0")}`,
                renderJobId: jobId,
                clipId: id,
                type: "clip",
                title: editors.get(id)?.clip.title ?? "Previous exported clip",
                durationSeconds: 2.4,
                fileSizeBytes: sourceVideo.length,
                width: 1080,
                height: 1920,
                status: "ready",
                createdAt: new Date(now).toISOString(),
                expiresAt: new Date(now + 7 * 86400000).toISOString(),
              })),
          ),
        );
        return;
      }
      if (
        url.pathname === `${apiPath}/source-video/content` ||
        url.pathname.endsWith("/download")
      ) {
        response.setHeader("Content-Type", "video/mp4");
        response.setHeader("Accept-Ranges", "bytes");
        const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "");
        if (range) {
          const start = Number(range[1]);
          const end = range[2]
            ? Math.min(sourceVideo.length - 1, Number(range[2]))
            : sourceVideo.length - 1;
          if (start >= sourceVideo.length || end < start) {
            response.statusCode = 416;
            response.setHeader("Content-Range", `bytes */${sourceVideo.length}`);
            response.end();
            return;
          }
          response.statusCode = 206;
          response.setHeader("Content-Range", `bytes ${start}-${end}/${sourceVideo.length}`);
          response.setHeader("Content-Length", end - start + 1);
          response.end(sourceVideo.subarray(start, end + 1));
        } else {
          response.setHeader("Content-Length", sourceVideo.length);
          response.end(sourceVideo);
        }
        return;
      }
      if (url.pathname === "/fonts/Inter-Black.ttf" || url.pathname === "/bundle.js") {
        response.setHeader(
          "Content-Type",
          url.pathname.endsWith(".js") ? "text/javascript" : "font/ttf",
        );
        response.end(
          await readFile(
            url.pathname.endsWith(".js")
              ? join(root, "bundle.js")
              : resolve("packages/shared/assets/fonts/Inter-Black.ttf"),
          ),
        );
        return;
      }
      fail(response, "Fixture route not found.", 404);
    })().catch((error: unknown) =>
      fail(response, error instanceof Error ? error.message : "Fixture request failed.", 400),
    );
  });
  server.listen(4317, "127.0.0.1", () =>
    console.log("Synthetic VS7 browser fixture: http://127.0.0.1:4317"),
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
