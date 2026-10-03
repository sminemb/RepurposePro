import { execFile, spawn } from "node:child_process";
import { assertSafeStoragePath, assertSafeExecutable } from "@repurposepro/config";
import { framingTracksSchema, type FramingTracks } from "@repurposepro/shared";

export interface FaceTrackerOptions {
  pythonPath: string;
  scriptPath: string;
  modelPath: string;
  storageRoot: string;
  ffmpegPath: string;
  ffprobePath: string;
  timeoutMs: number;
}

export class FaceTracker {
  constructor(private readonly options: FaceTrackerOptions) {
    assertSafeExecutable(options.pythonPath, "python");
    assertSafeExecutable(options.ffmpegPath, "ffmpeg");
    assertSafeExecutable(options.ffprobePath, "ffprobe");
  }

  async analyze(sourcePath: string, signal: AbortSignal): Promise<FramingTracks> {
    signal.throwIfAborted();
    const source = await assertSafeStoragePath(this.options.storageRoot, sourcePath);
    return new Promise((resolveResult, reject) => {
      const child = spawn(
        this.options.pythonPath,
        [
          this.options.scriptPath,
          "--source",
          source,
          "--model",
          this.options.modelPath,
          "--ffmpeg",
          this.options.ffmpegPath,
          "--ffprobe",
          this.options.ffprobePath,
        ],
        { windowsHide: true, shell: false, stdio: ["ignore", "pipe", "ignore"] },
      );
      let output = "",
        failure: Error | undefined;
      const stop = () => {
        failure ??= new Error("Face tracking was interrupted or timed out.");
        if (process.platform === "win32" && child.pid)
          execFile(
            "taskkill",
            ["/pid", String(child.pid), "/T", "/F"],
            { windowsHide: true },
            () => undefined,
          );
        else child.kill("SIGKILL");
      };
      const timer = setTimeout(stop, this.options.timeoutMs);
      signal.addEventListener("abort", stop, { once: true });
      if (signal.aborted) stop();
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", stop);
      };
      child.stdout.on("data", (chunk: Buffer) => {
        if (failure) return;
        output += chunk.toString("utf8");
        if (output.length > 32 * 1024 * 1024) {
          failure = new Error("Face tracking output exceeds the size limit.");
          stop();
        }
      });
      child.on("error", () => {
        cleanup();
        reject(new Error("Face tracking could not start. Check the local Python environment."));
      });
      child.on("close", (code) => {
        cleanup();
        if (failure || code !== 0) {
          reject(
            failure ?? new Error("Face tracking failed. Check the pinned model and dependencies."),
          );
          return;
        }
        try {
          resolveResult(framingTracksSchema.parse(JSON.parse(output)));
        } catch {
          reject(new Error("Face tracking returned invalid data."));
        }
      });
    });
  }
}
