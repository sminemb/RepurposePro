"use client";

import type { SourceVideoMetadata } from "@repurposepro/shared";
import { FileVideo, LoaderCircle, RotateCcw, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { VideoMetadataCard } from "./video-metadata-card";
import {
  getSourceVideoMetadata,
  toUploadProgress,
  type UploadProgress,
  uploadVideo,
} from "../client/upload-video";

interface UploadDropzoneProps {
  readonly apiUrl: string;
  readonly projectId: string;
}

type UploadState = "idle" | "uploading" | "uploaded" | "error";

function formatFileSize(bytes: number): string {
  if (bytes < 1_024 * 1_024) {
    return `${Math.max(1, Math.round(bytes / 1_024))} KB`;
  }

  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
}

export function UploadDropzone({ apiUrl, projectId }: UploadDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<SourceVideoMetadata | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress>(() => toUploadProgress(0, 0));
  const [state, setState] = useState<UploadState>("idle");

  function selectFile(nextFile: File | null): void {
    if (!nextFile) {
      return;
    }

    setError(null);
    setFile(nextFile);
    setMetadata(null);
    setMetadataError(null);
    setMetadataLoading(false);
    setProgress(toUploadProgress(0, nextFile.size));
    setState("idle");
  }

  async function loadMetadata(): Promise<void> {
    setMetadataError(null);
    setMetadataLoading(true);

    try {
      setMetadata(await getSourceVideoMetadata({ apiUrl, projectId }));
    } catch (metadataLoadError) {
      setMetadataError(
        metadataLoadError instanceof Error
          ? metadataLoadError.message
          : "We could not load your validated video details. Try again.",
      );
    } finally {
      setMetadataLoading(false);
    }
  }

  async function startUpload(): Promise<void> {
    if (!file) {
      return;
    }

    setError(null);
    setState("uploading");
    setProgress(toUploadProgress(0, file.size));

    try {
      await uploadVideo({ apiUrl, file, onProgress: setProgress, projectId });
      setProgress(toUploadProgress(file.size, file.size));
      setState("uploaded");
      await loadMetadata();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "We could not upload this video. Please try again.",
      );
      setState("error");
    }
  }

  const isUploading = state === "uploading";
  const progressLabel = progress.percent === null ? "Uploading" : `${progress.percent}% uploaded`;

  return (
    <div className="grid gap-5">
      <input
        ref={fileInputRef}
        accept="video/*"
        className="sr-only"
        disabled={isUploading}
        id="source-video"
        type="file"
        onChange={(event) => selectFile(event.target.files?.item(0) ?? null)}
      />

      <div
        className={cn(
          "flex min-h-64 flex-col items-center justify-center rounded-rp-lg border border-dashed px-6 py-10 text-center transition-colors sm:min-h-76",
          dragActive
            ? "border-rp-primary bg-rp-primary-soft/55 shadow-rp-glow"
            : "border-rp-border-strong bg-rp-surface/55 hover:border-rp-primary/60 hover:bg-rp-card/75",
          isUploading && "cursor-wait opacity-75",
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!isUploading) setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragActive(false);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          if (!isUploading) selectFile(event.dataTransfer.files.item(0));
        }}
      >
        <span className="grid size-13 place-items-center rounded-rp-md border border-rp-primary/30 bg-rp-primary-soft text-rp-primary">
          <UploadCloud aria-hidden="true" className="size-6" />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-rp-text">Drop your source video here</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-rp-text-muted">
          Drag and drop a local video, or choose one from your device.
        </p>
        <button
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-rp-md border border-rp-border-strong bg-rp-surface px-4 text-sm font-semibold text-rp-text transition-colors hover:border-rp-primary/60 hover:bg-rp-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rp-primary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isUploading}
          type="button"
          onClick={() => fileInputRef.current?.click()}
        >
          Choose video
        </button>
        <p className="mt-5 text-xs leading-5 text-rp-text-muted">
          Video files only · Up to 500 MB · Up to 30 minutes · English audio required
        </p>
      </div>

      {file ? (
        <section
          aria-live="polite"
          className="rounded-rp-lg border border-rp-border bg-rp-surface/75 p-5"
        >
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-rp-md border border-rp-primary/25 bg-rp-primary-soft text-rp-primary">
              <FileVideo aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-rp-text">{file.name}</p>
              <p className="mt-1 text-xs text-rp-text-muted">{formatFileSize(file.size)}</p>
            </div>
          </div>

          {isUploading || state === "uploaded" ? (
            <div className="mt-5">
              <div className="flex items-center justify-between gap-3 text-xs text-rp-text-muted">
                <span>{state === "uploaded" ? "Upload complete" : progressLabel}</span>
                <span>{formatFileSize(progress.loadedBytes)} uploaded</span>
              </div>
              <div
                aria-label={progressLabel}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={progress.percent ?? undefined}
                className="mt-2 h-2 overflow-hidden rounded-full bg-rp-timeline-track"
                role="progressbar"
              >
                <div
                  className="h-full rounded-full bg-rp-primary transition-[width] duration-200 motion-reduce:transition-none"
                  style={{ width: `${progress.percent ?? 0}%` }}
                />
              </div>
            </div>
          ) : null}

          {state === "uploaded" && metadata ? (
            <div className="mt-5">
              <VideoMetadataCard metadata={metadata} />
            </div>
          ) : null}

          {state === "uploaded" && !metadata ? (
            <div
              aria-live="polite"
              className="mt-5 rounded-rp-md border border-rp-border bg-rp-card/55 px-4 py-3"
            >
              <p className="text-sm leading-6 text-rp-success">Your upload is complete.</p>
              {metadataLoading ? (
                <p className="mt-1 text-sm text-rp-text-muted">Loading validated video details.</p>
              ) : null}
              {metadataError ? (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <p className="text-sm leading-6 text-rp-text" role="alert">
                    {metadataError}
                  </p>
                  <button
                    className="inline-flex min-h-11 items-center gap-2 rounded-rp-sm border border-rp-border-strong bg-rp-surface px-3 text-sm font-semibold text-rp-text transition-colors hover:border-rp-primary/60 hover:bg-rp-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rp-primary disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={metadataLoading}
                    type="button"
                    onClick={() => void loadMetadata()}
                  >
                    <RotateCcw aria-hidden="true" className="size-4" /> Retry details
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p
              className="mt-5 rounded-rp-md border border-rp-danger/35 bg-rp-danger-soft/45 px-4 py-3 text-sm leading-6 text-rp-text"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          {state !== "uploaded" ? (
            <div className="mt-5 flex justify-end">
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-rp-md bg-rp-primary px-5 text-sm font-semibold text-rp-primary-foreground transition-colors hover:bg-rp-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rp-primary disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isUploading}
                type="button"
                onClick={startUpload}
              >
                {isUploading ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin motion-reduce:animate-none"
                  />
                ) : null}
                {isUploading ? "Uploading video" : "Upload video"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
