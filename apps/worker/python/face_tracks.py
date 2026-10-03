"""Local face tracks. No video data is sent to an external service."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess

MODEL_SHA256 = "b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f"
MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"


def display_dimensions(stream):
    width, height = stream["width"], stream["height"]
    sar = stream.get("sample_aspect_ratio", "1:1").split(":")
    if len(sar) == 2 and float(sar[1]) > 0:
        width *= float(sar[0]) / float(sar[1])
    rotation = float(stream.get("tags", {}).get("rotate", 0))
    for data in stream.get("side_data_list", []):
        rotation = float(data.get("rotation", rotation))
    if round(rotation / 90) % 2:
        width, height = height, width
    return max(2, round(width)), max(2, round(height))


def cost(track, box, time):
    last = track["samples"][-1]
    if time - last["time"] > 1.2:
        return math.inf
    px, py = last["x"], last["y"]
    if len(track["samples"]) > 1:
        prev = track["samples"][-2]
        scale = min(2, (time - last["time"]) / (last["time"] - prev["time"]))
        px += (last["x"] - prev["x"]) * scale
        py += (last["y"] - prev["y"]) * scale
    distance = math.hypot(px - box["x"], py - box["y"])
    size = abs(math.log(box["width"] / last["width"]))
    overlap_w = max(0, min(px + last["width"], box["x"] + box["width"]) - max(px, box["x"]))
    overlap_h = max(0, min(py + last["height"], box["y"] + box["height"]) - max(py, box["y"]))
    overlap = overlap_w * overlap_h / max(last["width"] * last["height"], box["width"] * box["height"])
    if distance > max(.12, last["width"] * 1.2) or size > .7:
        return math.inf
    return distance + size * .08 + (1 - overlap) * .03


class Tracker:
    def __init__(self):
        self.tracks = []

    def add(self, time, boxes):
        costs = [[cost(track, box, time) for box in boxes] for track in self.tracks]
        used, plausible = set(), set()
        for row in costs:
            plausible.update(j for j, value in enumerate(row) if math.isfinite(value))
        # Mutual, unambiguous best matches only. Ambiguity never triggers a switch.
        for i, row in enumerate(costs):
            ranked = sorted((value, j) for j, value in enumerate(row) if math.isfinite(value))
            if not ranked or (len(ranked) > 1 and ranked[1][0] - ranked[0][0] < .035):
                continue
            value, j = ranked[0]
            rivals = sorted(costs[k][j] for k in range(len(costs)) if k != i)
            if j in used or (rivals and rivals[0] - value < .035):
                continue
            self.tracks[i]["samples"].append({"time": time, **boxes[j]})
            used.add(j)
        for j, box in enumerate(boxes):
            if j not in used and j not in plausible and len(self.tracks) < 200:
                self.tracks.append({"id": f"person-{len(self.tracks) + 1}", "samples": [{"time": time, **box}]})

    def result(self):
        output = []
        for track in self.tracks:
            samples = track["samples"]
            smoothed = []
            for i, sample in enumerate(samples):
                neighbors = [s for s in samples[max(0, i-1):i+2] if abs(s["time"]-sample["time"]) <= .21]
                smoothed.append({**sample, **{k: sum(s[k] for s in neighbors)/len(neighbors) for k in ("x", "y", "width", "height")}})
            output.append({"id": track["id"], "samples": smoothed})
        return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    args = parser.parse_args()
    if hashlib.sha256(Path(args.model).read_bytes()).hexdigest() != MODEL_SHA256:
        raise ValueError("Face model checksum mismatch; run setup-framing.py")
    import numpy as np
    import mediapipe as mp
    probe = subprocess.run([args.ffprobe, "-v", "error", "-select_streams", "v:0", "-show_streams", "-of", "json", "-protocol_whitelist", "file,pipe", args.source], capture_output=True, check=True, timeout=30)
    stream = json.loads(probe.stdout)["streams"][0]
    width, height = display_dimensions(stream)
    scale = min(1, 640 / max(width, height))
    w, h = max(2, round(width * scale / 2) * 2), max(2, round(height * scale / 2) * 2)
    # FFmpeg autorotates; explicit display dimensions also normalize non-square pixels.
    command = [args.ffmpeg, "-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe", "-i", args.source, "-map", "0:v:0", "-an", "-vf", f"fps=5,scale={w}:{h},setsar=1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]
    tracker = Tracker()
    options = mp.tasks.vision.FaceDetectorOptions(base_options=mp.tasks.BaseOptions(model_asset_path=args.model), running_mode=mp.tasks.vision.RunningMode.VIDEO, min_detection_confidence=.6)
    with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as video:
        try:
            with mp.tasks.vision.FaceDetector.create_from_options(options) as detector:
                index = 0
                while True:
                    frame = video.stdout.read(w * h * 3)
                    if not frame:
                        break
                    if len(frame) != w * h * 3:
                        raise ValueError("Incomplete decoded frame")
                    result = detector.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.frombuffer(frame, dtype=np.uint8).reshape(h, w, 3).copy()), index * 200)
                    boxes = []
                    for detection in result.detections:
                        b = detection.bounding_box
                        x, y = max(0, b.origin_x / w), max(0, b.origin_y / h)
                        bw, bh = min(1 - x, b.width / w), min(1 - y, b.height / h)
                        if bw > 0 and bh > 0:
                            boxes.append({"x": x, "y": y, "width": bw, "height": bh, "confidence": detection.categories[0].score})
                    tracker.add(index / 5, boxes)
                    index += 1
            if video.wait(timeout=10) != 0 or index == 0:
                raise ValueError("Video decode failed")
        finally:
            if video.poll() is None:
                video.kill()
                video.wait()
    print(json.dumps({"version": "mediapipe-v1", "width": width, "height": height, "tracks": tracker.result()}, separators=(",", ":"), allow_nan=False))


if __name__ == "__main__":
    main()
