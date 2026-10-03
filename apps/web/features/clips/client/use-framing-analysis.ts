"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { framingStatusSchema, type FramingStatus } from "@repurposepro/shared";

export function useFramingAnalysis(apiUrl: string, projectId: string, enabled = true) {
  const [status, setStatus] = useState<FramingStatus>({ status: "missing", data: null });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  const request = useCallback(
    async (start: boolean, signal?: AbortSignal) => {
      const response = await fetch(
        `${apiUrl.replace(/\/$/u, "")}/projects/${encodeURIComponent(projectId)}/framing-analysis`,
        { method: start ? "POST" : "GET", credentials: "include", cache: "no-store", signal },
      );
      if (!response.ok)
        throw new Error(
          response.status === 404
            ? "The source video is unavailable or expired. Manual framing is still available."
            : "Could not load person tracking. Try again.",
        );
      const body = (await response.json()) as { data: unknown };
      return framingStatusSchema.parse(body.data);
    },
    [apiUrl, projectId],
  );
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const current = ++generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await request(false, controller.signal);
        if (generation.current !== current || controller.signal.aborted) return;
        setStatus(next);
        setError("");
        if (next.status === "queued" || next.status === "active")
          timer = setTimeout(() => void poll(), 2000);
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : "Tracking unavailable.");
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
      ++generation.current;
    };
  }, [request, refresh, enabled]);
  const start = async () => {
    if (busy || !enabled) return;
    const current = generation.current;
    setBusy(true);
    setError("");
    try {
      const next = await request(true);
      if (generation.current === current) {
        setStatus(next);
        setRefresh((value) => value + 1);
      }
    } catch (failure) {
      if (generation.current === current)
        setError(failure instanceof Error ? failure.message : "Tracking unavailable.");
    } finally {
      setBusy(false);
    }
  };
  return {
    status,
    error,
    busy: busy || (!error && (status.status === "active" || status.status === "queued")),
    start,
  };
}
