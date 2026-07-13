export function formatFileSize(bytes: number): string {
  if (bytes < 1_024 * 1_024) {
    return `${Math.max(1, Math.round(bytes / 1_024))} KB`;
  }

  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
}

export function formatVideoDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const remainingSeconds = totalSeconds % 60;
  const paddedSeconds = remainingSeconds.toString().padStart(2, "0");

  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${paddedSeconds}`
    : `${minutes}:${paddedSeconds}`;
}

export function formatVideoFps(fps: number | null): string | null {
  if (fps === null) {
    return null;
  }

  return `${Number(fps.toFixed(2))} fps`;
}
