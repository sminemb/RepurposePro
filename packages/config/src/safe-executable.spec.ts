import { describe, expect, it } from "vitest";
import { assertSafeExecutable } from "./safe-executable";
describe("server executable allowlist", () => {
  it("accepts installed media/Python binaries", () => {
    for (const value of ["ffmpeg", "C:/tools/ffmpeg.exe"])
      expect(() => assertSafeExecutable(value, "ffmpeg")).not.toThrow();
    expect(() => assertSafeExecutable("python", "python")).not.toThrow();
  });
  it.each([
    "cmd.exe",
    "powershell",
    "ffmpeg -i secret",
    "./ffmpeg",
    "https://evil/ffmpeg",
    "ffmpeg\n",
  ])("rejects executable/flag substitution %j", (value) => {
    expect(() => assertSafeExecutable(value, "ffmpeg")).toThrow();
  });
});
