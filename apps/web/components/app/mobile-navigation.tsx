"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AppSidebar } from "@/components/app/app-sidebar";

interface MobileNavigationProps {
  readonly userEmail: string;
  readonly userName: string;
}

export function MobileNavigation({ userEmail, userName }: MobileNavigationProps) {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function close() {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Open navigation"
        className="grid size-11 place-items-center rounded-rp-md border border-rp-border text-rp-text-muted hover:bg-rp-card hover:text-rp-text lg:hidden"
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
      >
        <Menu aria-hidden="true" className="size-5" />
      </button>
      {open ? (
        <div
          aria-label="Mobile navigation"
          aria-modal="true"
          className="fixed inset-0 z-80 bg-black/65 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in"
          role="dialog"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            className="ml-auto flex h-full w-[min(88vw,20rem)] flex-col bg-rp-surface shadow-rp-modal motion-safe:animate-in motion-safe:slide-in-from-right"
            ref={panelRef}
          >
            <button
              aria-label="Close navigation"
              className="absolute right-4 top-4 z-10 grid size-11 place-items-center rounded-rp-md text-rp-text-muted hover:bg-rp-card hover:text-rp-text"
              ref={closeButtonRef}
              type="button"
              onClick={close}
            >
              <X aria-hidden="true" className="size-5" />
            </button>
            <AppSidebar className="h-auto min-h-0 w-full flex-1 border-r-0 pt-20" />
            <div className="border-t border-rp-border bg-rp-surface px-5 py-5">
              <p className="text-sm font-medium text-rp-text">{userName}</p>
              <p className="mt-1 truncate text-xs text-rp-text-muted">{userEmail}</p>
              <form action="/api/auth/sign-out" className="mt-4" method="post">
                <button
                  className="min-h-11 text-sm text-rp-text-muted hover:text-rp-text"
                  type="submit"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
