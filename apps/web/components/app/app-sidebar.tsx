import { CreditCard, LayoutDashboard, LockKeyhole, Plus, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/app/brand-mark";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  readonly className?: string;
}

interface NavigationItem {
  readonly active: boolean;
  readonly href?: string;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly locked: boolean;
}

const navigation: readonly NavigationItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", active: true, locked: false },
  { label: "New Project", icon: Plus, href: "/projects/new", active: false, locked: false },
  { label: "Billing", icon: CreditCard, active: false, locked: true },
  { label: "Settings", icon: Settings, active: false, locked: true },
];

export function AppSidebar({ className }: AppSidebarProps) {
  return (
    <aside
      aria-label="Primary"
      className={cn(
        "flex h-full w-66 shrink-0 flex-col border-r border-rp-border bg-rp-surface/92 px-4 py-6",
        className,
      )}
    >
      <BrandMark className="px-2" href="/" />
      <nav className="mt-10 grid gap-2">
        {navigation.map(({ active, href, icon: Icon, label, locked }) =>
          href ? (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-rp-md px-3 text-sm font-medium transition-colors",
                active
                  ? "border border-rp-primary/20 bg-rp-primary-soft text-rp-text"
                  : "text-rp-text-muted hover:bg-rp-card hover:text-rp-text",
              )}
              href={href}
              key={label}
            >
              <Icon aria-hidden="true" className="size-5 text-rp-primary" /> {label}
            </Link>
          ) : (
            <span
              aria-disabled={locked}
              className="flex min-h-12 cursor-not-allowed items-center gap-3 rounded-rp-md px-3 text-sm text-rp-text-disabled"
              key={label}
            >
              <Icon aria-hidden="true" className="size-5" /> {label}
              <LockKeyhole aria-hidden="true" className="ml-auto size-4" />
            </span>
          ),
        )}
      </nav>
      <div className="mt-auto rounded-rp-md border border-rp-border bg-rp-bg/70 p-4">
        <div className="flex gap-3">
          <Plus aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-rp-primary" />
          <div>
            <p className="text-sm font-medium text-rp-text">Start with a project.</p>
            <p className="mt-1 text-xs leading-5 text-rp-text-muted">
              Upload your source video in the next step.
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
