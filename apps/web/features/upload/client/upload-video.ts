import type { ApiSuccess, SourceVideoMetadata } from "@repurposepro/shared";

export interface UploadProgress {
  readonly loadedBytes: number;
  readonly percent: number | null;
  readonly totalBytes: number | null;
}

interface UploadVideoInput {
  readonly apiUrl: string;
  readonly file: File;
  readonly onProgress: (progress: UploadProgress) => void;
  readonly projectId: string;
}

interface SourceVideoMetadataInput {
  readonly apiUrl: string;
  readonly projectId: string;
}

interface ApiErrorResponse {
  readonly error?: {
    readonly message?: string;
  };
}

export function createUploadEndpoint(apiUrl: string, projectId: string): string {
  return `${apiUrl.replace(/\/$/, "")}/projects/${encodeURIComponent(projectId)}/upload`;
}

export function createSourceVideoMetadataEndpoint(apiUrl: string, projectId: string): string {
  return `${apiUrl.replace(/\/$/, "")}/projects/${encodeURIComponent(projectId)}/video`;
}

export function toUploadProgress(loadedBytes: number, totalBytes: number): UploadProgress {
  if (totalBytes <= 0) {
    return { loadedBytes, percent: null, totalBytes: null };
  }

  return {
    loadedBytes,
    percent: Math.floor((loadedBytes / totalBytes) * 100),
    totalBytes,
  };
}

function responseErrorMessage(responseText: string, fallback: string): string {
  try {
    const response = JSON.parse(responseText) as ApiErrorResponse;
    if (response.error?.message) {
      return response.error.message;
    }
  } catch {
    // Preserve the safe fallback below for non-JSON responses.
  }

  return fallback;
}

export async function getSourceVideoMetadata({
  apiUrl,
  projectId,
}: SourceVideoMetadataInput): Promise<SourceVideoMetadata> {
  const response = await fetch(createSourceVideoMetadataEndpoint(apiUrl, projectId), {
    credentials: "include",
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(
      responseErrorMessage(
        await response.text(),
        "We could not load your validated video details. Try again.",
      ),
    );
  }

  const body = (await response.json()) as ApiSuccess<SourceVideoMetadata>;
  return body.data;
}

export function uploadVideo({
  apiUrl,
  file,
  onProgress,
  projectId,
}: UploadVideoInput): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", createUploadEndpoint(apiUrl, projectId));
    request.withCredentials = true;

    request.upload.addEventListener("progress", (event) => {
      onProgress(toUploadProgress(event.loaded, event.lengthComputable ? event.total : 0));
    });

    request.addEventListener("error", () => {
      reject(new Error("We could not reach RepurposePro. Check your connection and try again."));
    });

    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }

      reject(
        new Error(
          responseErrorMessage(
            request.responseText,
            "We could not upload this video. Please try again.",
          ),
        ),
      );
    });

    const formData = new FormData();
    formData.set("file", file);
    request.send(formData);
  });
}
