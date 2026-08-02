import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveWhisperScriptPath } from "./whisper-script-path";

describe("resolveWhisperScriptPath", () => {
  it.each(["src", "dist"])("resolves from the worker %s directory", (moduleDirectory) => {
    const workerRoot = resolve(__dirname, "..");
    const expectedPath = resolve(workerRoot, "python", "transcribe.py");

    const scriptPath = resolveWhisperScriptPath(resolve(workerRoot, moduleDirectory));

    expect(scriptPath).toBe(expectedPath);
    expect(existsSync(scriptPath)).toBe(true);
  });
});
