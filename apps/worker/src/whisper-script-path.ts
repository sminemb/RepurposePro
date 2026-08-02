import { resolve } from "node:path";

export function resolveWhisperScriptPath(moduleDirectory: string): string {
  return resolve(moduleDirectory, "../python/transcribe.py");
}
