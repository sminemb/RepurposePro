"use client";
import { useEffect, useState } from "react";
import type { SourceVideoMetadata } from "@repurposepro/shared";
import { useExpiration } from "@/components/app/expiration-badge";

export function useSourceRetention(apiUrl: string, projectId: string) {
  const [metadata, setMetadata] = useState<SourceVideoMetadata | null>(null);
  const [error, setError] = useState("");
  const state = useExpiration(metadata?.expiresAt);
  useEffect(() => {
    const abort = new AbortController();
    void fetch(`${apiUrl.replace(/\/$/u, "")}/projects/${encodeURIComponent(projectId)}/video`, {
      credentials: "include",
      cache: "no-store",
      signal: abort.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Source video availability could not be verified.");
        const body = (await response.json()) as { data?: SourceVideoMetadata };
        if (!body.data || !Number.isFinite(Date.parse(body.data.expiresAt)))
          throw new Error("Source video availability could not be verified.");
        if (!abort.signal.aborted) {
          setMetadata(body.data);
          setError("");
        }
      })
      .catch((failure) => {
        if (!abort.signal.aborted)
          setError(failure instanceof Error ? failure.message : "Source unavailable.");
      });
    return () => abort.abort();
  }, [apiUrl, projectId]);
  return {
    metadata,
    error,
    available:
      !!metadata &&
      state !== "expired" &&
      !metadata.deletedAt &&
      metadata.status !== "deleted" &&
      metadata.status !== "expired",
  };
}
