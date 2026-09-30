import { copyFile, mkdir, writeFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { type ClipPreviewCandidate, captionLayout } from "@repurposepro/shared";
import {
  cropCommands,
  displayDimensions,
  probeMedia,
  renderMp4,
  runMedia,
} from "../apps/worker/src/services/render-ffmpeg";
import { generateAss } from "../apps/worker/src/services/render-subtitles";
import type * as Canvas from "../apps/worker/node_modules/@napi-rs/canvas";

const workerRequire = createRequire(resolve("apps/worker/package.json"));
const { createCanvas, GlobalFonts } = workerRequire("@napi-rs/canvas") as typeof Canvas;
const root = resolve("storage/vs6-verification");
const fontPath = resolve("packages/shared/assets/fonts/Inter-Black.ttf");
const base: ClipPreviewCandidate = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "VS6 parity fixture",
  startTime: 0.125,
  endTime: 2.525,
  rank: 0,
  score: 1,
  crop: null,
  captionStyle: "hormozi",
  captionsEnabled: true,
  captionPosition: { x: 0.5, y: 0.72 },
  previewFontSize: 64,
  captionTextColor: "#ffff00",
  captionLines: [
    {
      startTime: 0.125,
      endTime: 1.125,
      text: "A great idea",
      highlights: ["great", "idea"],
      highlightColors: { great: "#00ff00", idea: "#0088ff" },
    },
    {
      startTime: 1.425,
      endTime: 2.525,
      text: "A long caption with Unicode café and literal {braces} \\N \\n \\h",
    },
  ],
};
async function main() {
  await mkdir(root, { recursive: true });
  GlobalFonts.registerFromPath(fontPath, "RP Caption");
  const context = createCanvas(1, 1).getContext("2d");
  context.font = '900 64px "RP Caption"';
  const measure = (text: string) => context.measureText(text).width;
  const fixtures = [
    {
      name: "manual",
      size: "1920x1080",
      sar: "1/1",
      framing: {
        mode: "manual" as const,
        trackId: null,
        offset: { x: 0, y: 0 },
        manualCenter: { x: 0.9, y: 0.5 },
      },
    },
    {
      name: "follow",
      size: "1920x1080",
      sar: "1/1",
      framing: {
        mode: "follow" as const,
        trackId: "person",
        offset: { x: 0, y: 0 },
        manualCenter: { x: 0.5, y: 0.5 },
      },
    },
    { name: "portrait", size: "720x1280", sar: "1/1", framing: undefined },
    { name: "anamorphic", size: "720x576", sar: "16/15", framing: undefined },
    { name: "disabled", size: "1920x1080", sar: "1/1", framing: undefined },
    { name: "rotated", size: "1280x720", sar: "1/1", framing: undefined },
  ];
  const tracks = {
    version: "mediapipe-v1" as const,
    width: 1920,
    height: 1080,
    tracks: [
      {
        id: "person",
        samples: [
          { time: 0, x: 0.1, y: 0.3, width: 0.1, height: 0.2, confidence: 1 },
          { time: 0.5, x: 0.5, y: 0.3, width: 0.1, height: 0.2, confidence: 1 },
          { time: 1, x: 0.7, y: 0.3, width: 0.1, height: 0.2, confidence: 1 },
          { time: 2, x: 0.2, y: 0.3, width: 0.1, height: 0.2, confidence: 1 },
        ],
      },
    ],
  };
  const evidence: unknown[] = [];
  for (const fixture of fixtures) {
    const directory = join(root, fixture.name);
    await mkdir(join(directory, "fonts"), { recursive: true });
    await copyFile(fontPath, join(directory, "fonts/Inter-Black.ttf"));
    const generated = join(directory, fixture.name === "rotated" ? "unrotated.mp4" : "source.mp4");
    await runMedia(
      "ffmpeg",
      [
        "-hide_banner",
        "-y",
        "-f",
        "lavfi",
        "-i",
        `testsrc2=size=${fixture.size}:rate=30:duration=3`,
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=3",
        "-vf",
        `setsar=${fixture.sar}`,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-c:a",
        "aac",
        "-shortest",
        generated,
      ],
      { timeoutMs: 30000 },
    );
    const source = join(directory, "source.mp4");
    if (fixture.name === "rotated")
      await runMedia(
        "ffmpeg",
        [
          "-hide_banner",
          "-y",
          "-i",
          generated,
          "-c",
          "copy",
          "-metadata:s:v:0",
          "rotate=90",
          source,
        ],
        { timeoutMs: 30000 },
      );
    const clip: ClipPreviewCandidate = {
      ...base,
      framing: fixture.framing,
      captionsEnabled: fixture.name !== "disabled",
    };
    await writeFile(join(directory, "captions.ass"), generateAss(clip, measure));
    const probe = await probeMedia("ffprobe", source),
      dimensions = displayDimensions(probe.streams.find((s) => s.codec_type === "video")!);
    await renderMp4({
      ffmpegPath: "ffmpeg",
      sourcePath: source,
      directory,
      clip,
      tracks: fixture.name === "follow" ? tracks : null,
      dimensions,
      timeoutMs: 120000,
      crf: 20,
      preset: "veryfast",
      signal: new AbortController().signal,
      onProgress: () => undefined,
    });
    const output = await probeMedia("ffprobe", join(directory, "output.mp4"));
    const v = output.streams.find((s) => s.codec_type === "video")!,
      a = output.streams.find((s) => s.codec_type === "audio")!;
    if (
      v.width !== 1080 ||
      v.height !== 1920 ||
      v.codec_name !== "h264" ||
      a.codec_name !== "aac" ||
      Math.abs(Number(output.format.duration) - 2.4) > 0.12
    )
      throw new Error(`${fixture.name} output verification failed`);
    await runMedia(
      "ffmpeg",
      [
        "-hide_banner",
        "-y",
        "-ss",
        "0.5",
        "-i",
        join(directory, "output.mp4"),
        "-frames:v",
        "1",
        join(directory, "frame.png"),
      ],
      { timeoutMs: 30000 },
    );
    evidence.push({
      fixture: fixture.name,
      duration: output.format.duration,
      width: v.width,
      height: v.height,
      videoCodec: v.codec_name,
      audioCodec: a.codec_name,
      fileSizeBytes: (await stat(join(directory, "output.mp4"))).size,
    });
    await writeFile(
      join(directory, "preview.json"),
      JSON.stringify(
        {
          clip,
          tracks: fixture.name === "follow" ? tracks : null,
          dimensions,
          layout: captionLayout(clip.captionLines[0]!.text, clip.captionPosition, 64, measure),
          commands: cropCommands(clip, fixture.name === "follow" ? tracks : null, dimensions),
        },
        null,
        2,
      ),
    );
  }
  await writeFile(join(root, "evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
