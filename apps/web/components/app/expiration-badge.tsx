"use client";
import { useEffect, useState } from "react";
import { expirationState } from "@repurposepro/shared";

export function useExpiration(expiresAt: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = setInterval(update, 30_000);
    const deadline = expiresAt ? Date.parse(expiresAt) - Date.now() : 0;
    const boundaries = [deadline, deadline - 3_600_000 + 1, deadline - 86_400_000 + 1]
      .filter((delay) => delay > 0 && delay <= 2_147_483_647)
      .map((delay) => setTimeout(update, delay));
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      boundaries.forEach(clearTimeout);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [expiresAt]);
  return expiresAt ? expirationState(expiresAt, now) : null;
}
export function ExpirationBadge({
  expiresAt,
  label = "File",
}: {
  expiresAt: string;
  label?: string;
}) {
  const state = useExpiration(expiresAt)!;
  const [localDate, setLocalDate] = useState(expiresAt);
  useEffect(() => {
    setLocalDate(new Date(expiresAt).toLocaleString());
  }, [expiresAt]);
  const remaining = Math.max(0, Date.parse(expiresAt) - Date.now());
  const amount =
    remaining >= 86_400_000
      ? Math.ceil(remaining / 86_400_000)
      : remaining >= 3_600_000
        ? Math.ceil(remaining / 3_600_000)
        : Math.max(1, Math.ceil(remaining / 60_000));
  const unit = remaining >= 86_400_000 ? "day" : remaining >= 3_600_000 ? "hour" : "minute";
  const styles =
    state === "expired" || state === "urgent"
      ? "border-rp-danger/35 bg-rp-danger-soft/35 text-rp-danger"
      : state === "warning"
        ? "border-rp-warning/35 bg-rp-warning-soft/35 text-rp-warning"
        : "border-rp-border bg-rp-card text-rp-text-muted";
  return (
    <span
      className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5"
      suppressHydrationWarning
    >
      <span
        suppressHydrationWarning
        className={`rounded-rp-sm border px-2 py-1 ${styles}`}
        data-expiration-state={state}
      >
        {label}:{" "}
        {state === "expired" ? "Expired" : `Expires in ${amount} ${unit}${amount === 1 ? "" : "s"}`}
      </span>
      <time dateTime={expiresAt} className="text-rp-text-muted">
        {localDate}
      </time>
    </span>
  );
}
