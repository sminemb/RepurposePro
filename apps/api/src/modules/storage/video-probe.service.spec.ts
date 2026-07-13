import { describe, expect, it, vi } from "vitest";

import { VideoProbeError, VideoProbeService, parseVideoProbeOutput } from "./video-probe.service";

const validProbe = JSON.stringify({
  format: { duration: "61.5", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
  streams: [
    {
      avg_frame_rate: "30000/1001",
      codec_name: "h264",
      codec_type: "video",
      height: 1080,
      width: 1920,
    },
    { codec_name: "aac", codec_type: "audio" },
  ],
});

describe("parseVideoProbeOutput", () => {
  it("returns validated metadata and converts rational FPS", () => {
    expect(parseVideoProbeOutput(validProbe, 1_800)).toEqual({
      audioCodec: "aac",
      durationSeconds: 61.5,
      fps: 30_000 / 1_001,
      hasAudio: true,
      height: 1080,
      videoCodec: "h264",
      width: 1920,
    });
  });

  it("rejects malformed probe output without leaking its contents", () => {
    expect(() => parseVideoProbeOutput("not-json", 1_800)).toThrow(VideoProbeError);
    expect(() => parseVideoProbeOutput("not-json", 1_800)).toThrow(
      "We could not read this video. Try a different file.",
    );
  });

  it("treats an unexpected probe structure as invalid media", () => {
    expect(() =>
      parseVideoProbeOutput(
        JSON.stringify({ format: "not-an-object", streams: "not-an-array" }),
        1_800,
      ),
    ).toThrow("We could not read this video. Try a different file.");
  });

  it("rejects a container outside the selected upload families", () => {
    expect(() =>
      parseVideoProbeOutput(
        JSON.stringify({
          format: { duration: "20", format_name: "avi" },
          streams: [
            {
              avg_frame_rate: "30/1",
              codec_name: "h264",
              codec_type: "video",
              height: 720,
              width: 1280,
            },
            { codec_name: "aac", codec_type: "audio" },
          ],
        }),
        1_800,
      ),
    ).toThrow("Upload an MP4, MOV, WebM, or MKV video.");
  });

  it("rejects files without an audio stream", () => {
    expect(() =>
      parseVideoProbeOutput(
        JSON.stringify({
          format: { duration: "20", format_name: "matroska,webm" },
          streams: [
            {
              avg_frame_rate: "30/1",
              codec_name: "vp9",
              codec_type: "video",
              height: 720,
              width: 1280,
            },
          ],
        }),
        1_800,
      ),
    ).toThrow("This video does not contain an audio track.");
  });

  it("rejects invalid dimensions and a duration above the configured limit", () => {
    expect(() =>
      parseVideoProbeOutput(
        JSON.stringify({
          format: { duration: "0", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
          streams: [
            {
              avg_frame_rate: "0/0",
              codec_name: "h264",
              codec_type: "video",
              height: 0,
              width: 1920,
            },
            { codec_name: "aac", codec_type: "audio" },
          ],
        }),
        1_800,
      ),
    ).toThrow("We could not read this video. Try a different file.");

    expect(() => parseVideoProbeOutput(validProbe, 60)).toThrow(
      "This video is longer than the 30-minute limit.",
    );
  });
});

describe("VideoProbeService", () => {
  it("maps process failures to a safe probe error without exposing command details", async () => {
    const run = vi.fn().mockRejectedValue(new Error("ffprobe internal stderr C:/private/video"));
    const service = new VideoProbeService(
      { ffprobePath: "ffprobe", fileRetentionDays: 7, maxDurationSeconds: 1_800 },
      run,
    );

    const error = await service.probe("C:/private/video").catch((reason: unknown) => reason);

    expect(run).toHaveBeenCalledWith("ffprobe", expect.any(Array));
    expect(error).toMatchObject({
      failure: "probe_failed",
      message: "We could not validate this video right now. Please try again.",
    });
  });
});
