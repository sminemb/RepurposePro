import { createServer } from "node:http";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";

// Synthetic fixtures use the production React components; media stays in ignored storage.
const root = resolve("storage/vs6-verification");
const fixtureRequire = createRequire(resolve("node_modules/tsx/package.json"));
const { build } = fixtureRequire("esbuild") as {
  build: (options: Record<string, unknown>) => Promise<unknown>;
};
async function main() {
  const requests: Array<{ method: string; body: Record<string, unknown> }> = [];
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, "next-link.tsx"),
    "export default function Link(props) { return <a {...props}/>; }",
  );
  await writeFile(
    join(root, "next-navigation.ts"),
    'export function useRouter(){return {push:()=>location.assign("/?outputs=1")}}',
  );
  await writeFile(
    join(root, "entry.tsx"),
    `
import {createRoot} from '${resolve("apps/web/node_modules/react-dom/client").replaceAll("\\", "/")}';
import {ClipPreviewPlayer} from '${resolve("apps/web/features/clips/components/clip-preview-player").replaceAll("\\", "/")}';
import {OutputBrowser} from '${resolve("apps/web/features/rendering/components/output-browser").replaceAll("\\", "/")}';
import {RenderAction} from '${resolve("apps/web/features/rendering/components/render-action").replaceAll("\\", "/")}';
import {useClipEditor} from '${resolve("apps/web/features/clips/client/use-clip-editor").replaceAll("\\", "/")}';
const params=new URLSearchParams(location.search), name=params.get('fixture')||'manual';
const fixture=await (await fetch('/'+name+'/preview.json')).json();
const initial={clip:{...fixture.clip,revision:4},baseline:fixture.clip.captionLines.map((line,i)=>({...line,id:'generated-'+i})),captionEdits:[],sourceDurationSeconds:3};
function FixtureEditor(){const editor=useClipEditor(initial,'/api','fixture','fixture-owner',()=>{});return <div style={{padding:24}}><h1>Export your edited clip</h1><label>Caption size <input aria-label="Caption size" type="number" value={editor.draft.previewFontSize} onChange={event=>editor.update({...editor.draft,previewFontSize:Number(event.target.value)})}/></label><RenderAction apiUrl="/api" projectId="fixture" dirty={editor.dirty} disabled={Boolean(editor.validation)||editor.saving} prepare={editor.prepareRender}/><p role="status">{editor.error}</p></div>}
createRoot(document.getElementById('root')).render(params.has('editor')?<FixtureEditor/>:params.has('outputs')?<OutputBrowser apiUrl="/api" projectId="fixture"/>:<ClipPreviewPlayer clip={fixture.clip} tracks={fixture.tracks} apiUrl={'/'+name} projectId="fixture" onTimeChange={()=>{}}/>);
if(!params.has('outputs')&&!params.has('editor')) { const timer=setInterval(()=>{const video=document.querySelector('video');if(video?.readyState>=1){clearInterval(timer); video.controls=false;video.currentTime=Number(params.get('time')||0.625);}},100); }
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
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"><style>
@font-face{font-family:'RP Caption';src:url('/font.ttf');font-weight:900;font-display:block}*{box-sizing:border-box}body{margin:0;background:#0b0d12;color:#f5f6f8;font-family:Arial}body:has(.space-y-6) #root{padding:24px;max-width:1200px;margin:auto}p{margin:0}h2{margin:0}section>div:first-child:has(h2){display:none}section>div:has(video){container-type:inline-size;position:relative;width:1080px;max-width:none;height:1920px;overflow:hidden;border:0;border-radius:0}video{width:100%;height:100%;object-fit:cover}.absolute{position:absolute}.text-center{text-align:center}.bg-black\\/80{background:rgba(0,0,0,.8)}.space-y-6>*{margin-bottom:24px}a{display:inline-block;padding:12px}progress{width:100%}
</style></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>`;
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (url.pathname === "/") {
        response.setHeader("Content-Type", "text/html");
        response.end(html);
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
      if (url.pathname === "/requests.json") {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(requests));
        return;
      }
      if (
        request.method === "PATCH" ||
        (request.method === "POST" && url.pathname.endsWith("/render"))
      ) {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(chunk as Buffer);
        const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
        requests.push({ method: request.method, body });
        response.setHeader("Content-Type", "application/json");
        if (request.method === "POST") {
          response.statusCode = 202;
          response.end(
            JSON.stringify({
              data: {
                jobId: "00000000-0000-4000-8000-000000000001",
                status: "queued",
                outputCount: 1,
              },
            }),
          );
          return;
        }
        const fixture = JSON.parse(await readFile(join(root, "manual/preview.json"), "utf8")) as {
          clip: Record<string, unknown> & { captionLines: Array<Record<string, unknown>> };
        };
        setTimeout(
          () =>
            response.end(
              JSON.stringify({
                data: {
                  clip: { ...fixture.clip, revision: 7, previewFontSize: body.previewFontSize },
                  baseline: fixture.clip.captionLines.map((line, index) => ({
                    ...line,
                    id: `generated-${index}`,
                  })),
                  captionEdits: [],
                  sourceDurationSeconds: 3,
                },
              }),
            ),
          700,
        );
        return;
      }
      if (url.pathname === "/api/projects/fixture/status") {
        const state =
          new URL(
            request.headers.referer ?? "http://localhost",
            "http://localhost",
          ).searchParams.get("state") ?? "completed";
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            data: {
              projectId: "fixture",
              status:
                state === "failed"
                  ? "preview_ready"
                  : state === "completed"
                    ? "completed"
                    : "rendering",
              currentJob: {
                id: "00000000-0000-4000-8000-000000000001",
                status:
                  state === "failed"
                    ? "failed"
                    : state === "completed"
                      ? "completed"
                      : state === "queued"
                        ? "queued"
                        : "active",
                step: state,
                progress:
                  state === "completed"
                    ? 100
                    : state === "queued"
                      ? 0
                      : state === "saving_output"
                        ? 97
                        : 42,
              },
            },
          }),
        );
        return;
      }
      if (url.pathname === "/api/projects/fixture/outputs") {
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            data: [
              {
                id: "00000000-0000-4000-8000-000000000002",
                renderJobId: "00000000-0000-4000-8000-000000000001",
                clipId: "00000000-0000-4000-8000-000000000003",
                type: "clip",
                title: "VS6 parity fixture",
                durationSeconds: 2.4,
                fileSizeBytes: 2021108,
                width: 1080,
                height: 1920,
                status: "ready",
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
              },
            ],
          }),
        );
        return;
      }
      let path =
        url.pathname === "/font.ttf" || url.pathname === "/fonts/Inter-Black.ttf"
          ? resolve("packages/shared/assets/fonts/Inter-Black.ttf")
          : join(root, url.pathname.slice(1));
      const match =
        /^\/(manual|follow|portrait|anamorphic|disabled|rotated)\/projects\/fixture\/source-video\/content$/.exec(
          url.pathname,
        );
      if (match) path = join(root, match[1]!, "source.mp4");
      const data = await readFile(path);
      const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "");
      if (path.endsWith(".mp4") && range) {
        const start = Number(range[1]),
          end = range[2] ? Math.min(data.length - 1, Number(range[2])) : data.length - 1;
        response.statusCode = 206;
        response.setHeader("Content-Type", "video/mp4");
        response.setHeader("Accept-Ranges", "bytes");
        response.setHeader("Content-Range", `bytes ${start}-${end}/${data.length}`);
        response.setHeader("Content-Length", end - start + 1);
        response.end(data.subarray(start, end + 1));
        return;
      }
      response.setHeader(
        "Content-Type",
        path.endsWith(".js")
          ? "text/javascript"
          : path.endsWith(".json")
            ? "application/json"
            : path.endsWith(".mp4")
              ? "video/mp4"
              : "application/octet-stream",
      );
      response.end(data);
    })().catch(() => {
      response.statusCode = 404;
      response.end();
    });
  });
  server.listen(4316, "127.0.0.1", () =>
    console.log("VS6 browser fixtures: http://127.0.0.1:4316"),
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
