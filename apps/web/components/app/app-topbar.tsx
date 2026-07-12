import { LayoutDashboard } from "lucide-react";

import { MobileNavigation } from "@/components/app/mobile-navigation";

interface AppTopbarProps {
  readonly title: string;
  readonly userEmail: string;
  readonly userName: string;
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function AppTopbar({ title, userEmail, userName }: AppTopbarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center border-b border-rp-border bg-rp-bg/88 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <MobileNavigation userEmail={userEmail} userName={userName} />
      <div className="ml-3 flex items-center gap-3 lg:ml-0">
        <LayoutDashboard aria-hidden="true" className="size-5 text-rp-primary" />
        <p className="text-sm font-medium text-rp-text">{title}</p>
      </div>
      <div className="ml-auto hidden items-center gap-4 sm:flex">
        <div className="grid size-9 place-items-center rounded-full border border-rp-primary/30 bg-rp-primary-soft text-xs font-semibold text-rp-primary">
          {initials(userName)}
        </div>
        <div className="hidden max-w-44 lg:block">
          <p className="truncate text-sm font-medium text-rp-text">{userName}</p>
          <p className="truncate text-xs text-rp-text-muted">{userEmail}</p>
        </div>
        <form action="/api/auth/sign-out" method="post">
          <button
            className="min-h-11 border-l border-rp-border pl-4 text-sm text-rp-text-muted hover:text-rp-text"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
