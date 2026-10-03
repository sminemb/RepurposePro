import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runMedia } from "./render-ffmpeg";
const spawn = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn }));
function child() {
  const process = new EventEmitter() as ChildProcess;
  const stdout = new PassThrough(),
    stderr = new PassThrough();
  const kill = vi.fn(() => {
    process.emit("close", null);
    return true;
  });
  Object.assign(process, { stdout, stderr, kill });
  spawn.mockReturnValue(process);
  return { process, stdout, stderr, kill };
}
afterEach(() => {
  vi.useRealTimers();
  spawn.mockReset();
});
describe("bounded shell-free media execution", () => {
  it("uses fixed executable arguments and omits raw error output", async () => {
    const fixture = child();
    const result = runMedia("ffmpeg", ["-version"], { timeoutMs: 1000 });
    fixture.stderr.write("SECRET_MARKER /private/path");
    fixture.process.emit("close", 1);
    await expect(result).rejects.toThrow("Media process failed.");
    expect(spawn).toHaveBeenCalledWith(
      "ffmpeg",
      ["-version"],
      expect.objectContaining({ shell: false, windowsHide: true }),
    );
  });
  it("kills timed-out work", async () => {
    vi.useFakeTimers();
    const fixture = child();
    const result = expect(runMedia("ffmpeg", [], { timeoutMs: 1000 })).rejects.toThrow(
      "time limit",
    );
    await vi.advanceTimersByTimeAsync(1000);
    await result;
    expect(fixture.kill).toHaveBeenCalledWith("SIGKILL");
  });
  it("cancels running work and rejects pre-cancelled work before spawn", async () => {
    const fixture = child(),
      controller = new AbortController();
    const result = runMedia("ffmpeg", [], { timeoutMs: 1000, signal: controller.signal });
    controller.abort();
    await expect(result).rejects.toThrow("cancelled");
    spawn.mockClear();
    await expect(
      runMedia("ffmpeg", [], { timeoutMs: 1000, signal: controller.signal }),
    ).rejects.toThrow();
    expect(spawn).not.toHaveBeenCalled();
    expect(fixture.kill).toHaveBeenCalledOnce();
  });
  it("bounds provider-controlled stdout", async () => {
    const fixture = child();
    const result = runMedia("ffprobe", [], { timeoutMs: 1000 });
    fixture.stdout.write("x".repeat(2_000_001));
    await expect(result).rejects.toThrow("output exceeded limit");
    expect(fixture.kill).toHaveBeenCalledOnce();
  });
  it("rejects command substitution before spawn", () => {
    expect(() => runMedia("cmd.exe", [], { timeoutMs: 1000 })).toThrow();
    expect(spawn).not.toHaveBeenCalled();
  });
});
