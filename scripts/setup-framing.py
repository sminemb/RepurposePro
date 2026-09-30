"""Download and verify the pinned model; dependencies are installed separately."""
import argparse
import hashlib
from pathlib import Path
import sys
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps/worker/python"))
from face_tracks import MODEL_SHA256, MODEL_URL

parser = argparse.ArgumentParser()
parser.add_argument("--destination", default="storage/models/blaze_face_short_range.tflite")
args = parser.parse_args()
target = Path(args.destination)
data = urllib.request.urlopen(MODEL_URL, timeout=60).read()
if hashlib.sha256(data).hexdigest() != MODEL_SHA256:
    raise ValueError("Model checksum does not match the pinned release")
target.parent.mkdir(parents=True, exist_ok=True)
target.write_bytes(data)
print(f"Verified face detector model: {target}")
