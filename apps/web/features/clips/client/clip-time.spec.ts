import { describe, expect, it } from "vitest";
import { formatClipTime, parseClipTime, recoverClipTime } from "./clip-time";

describe("clip timestamps", () => {
  it.each([
    [0, "00:00:00.000"],
    [59.999, "00:00:59.999"],
    [60, "00:01:00.000"],
    [342.6, "00:05:42.600"],
    [3599.999, "00:59:59.999"],
    [3600.001, "01:00:00.001"],
    [360000, "100:00:00.000"],
  ])("round-trips %s seconds without losing milliseconds", (seconds, timestamp) => {
    expect(formatClipTime(seconds)).toBe(timestamp);
    expect(parseClipTime(timestamp)).toBe(seconds);
  });
  it("accepts optional milliseconds and normalizes padding", () => {
    expect(parseClipTime("1:02:03")).toBe(3723);
    expect(parseClipTime(" 00:05:42.6 ")).toBe(342.6);
    expect(parseClipTime("00:00:01.23")).toBe(1.23);
    expect(formatClipTime(59.9999)).toBe("00:01:00.000");
  });
  it.each([
    "",
    "342.6",
    "00:01",
    "00:60:00",
    "00:00:60",
    "-1:00:00",
    "00:00:01.",
    "00:00:01.0001",
    "NaN",
    "Infinity",
    "1e2:00:00",
  ])("rejects invalid or incomplete input %s", (value) => expect(parseClipTime(value)).toBeNull());
  it("migrates legacy drafts without coercing unfinished input to zero", () => {
    expect(recoverClipTime("342.6")).toBe("00:05:42.600");
    expect(recoverClipTime("0")).toBe("00:00:00.000");
    expect(recoverClipTime("")).toBe("");
    expect(recoverClipTime("00:05:")).toBe("00:05:");
    expect(recoverClipTime("-1")).toBe("-1");
  });
});
