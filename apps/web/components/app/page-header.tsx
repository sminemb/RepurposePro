import type { ReactNode } from "react";

interface PageHeaderProps {
  readonly actions?: ReactNode;
  readonly description?: string;
  readonly title: string;
}

export function PageHeader({ actions, description, title }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-semibold tracking-[-0.05em] text-rp-text sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-rp-text-muted sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
