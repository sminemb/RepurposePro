import type { ReactNode } from "react";

interface EmptyStateProps {
  readonly action?: ReactNode;
  readonly description?: string;
  readonly icon?: ReactNode;
  readonly title: string;
}

export function EmptyState({ action, description, icon, title }: EmptyStateProps) {
  return (
    <section className="grid min-h-80 place-items-center rounded-rp-lg border border-dashed border-rp-border-strong bg-rp-surface/30 px-6 py-14 text-center">
      <div className="max-w-lg">
        {icon ? (
          <div className="mx-auto grid size-14 place-items-center rounded-rp-md border border-rp-primary/30 bg-rp-primary-soft text-rp-primary">
            {icon}
          </div>
        ) : null}
        <h2 className="mt-6 text-xl font-semibold text-rp-text">{title}</h2>
        {description ? (
          <p className="mt-3 text-sm leading-6 text-rp-text-muted">{description}</p>
        ) : null}
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </section>
  );
}
