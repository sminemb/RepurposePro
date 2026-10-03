import { basename, isAbsolute } from "node:path";

/** Executables come from server configuration, never queue payloads or user arguments. */
export function assertSafeExecutable(value: string, kind: "ffmpeg" | "ffprobe" | "python"): void {
  const name = basename(value.replaceAll("\\", "/")).toLowerCase();
  const allowed =
    kind === "python" ? ["python", "python3", "python.exe", "python3.exe"] : [kind, `${kind}.exe`];
  if (!allowed.includes(name) || /[\r\n\0]/.test(value) || (value !== name && !isAbsolute(value)))
    throw new Error("Unsupported executable configuration.");
}
