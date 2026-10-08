import type { ReactNode } from "react";

export function SettingsSection({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="rounded-rp-lg border border-rp-border bg-rp-surface p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-rp-text">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-rp-text-muted">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function FormFeedback({
  id,
  error,
  message,
  pending,
}: {
  readonly id: string;
  readonly error: string | null;
  readonly message: string | null;
  readonly pending: boolean;
}) {
  return (
    <div id={id} className="text-sm leading-6" aria-live="polite" aria-atomic="true">
      {error ? (
        <p className="text-rp-danger" role="alert">
          {error}
        </p>
      ) : (
        <p className="text-rp-text-muted" role="status">
          {pending ? "Saving…" : message}
        </p>
      )}
    </div>
  );
}
