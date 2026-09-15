"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useEditorNavigation(
  dirty: boolean,
  saving: boolean,
  save: () => Promise<boolean>,
  discard: () => void,
  clearRecovery: () => void,
  userId: string,
) {
  const [pending, setPending] = useState<{ action: () => void } | null>(null);
  const pendingRef = useRef<{ action: () => void } | null>(null);
  const bypass = useRef(false);
  const request = useCallback(
    (action: () => void) => {
      if (dirty || saving) {
        pendingRef.current = { action };
        setPending(pendingRef.current);
      } else action();
    },
    [dirty, saving],
  );
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!bypass.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const click = (event: MouseEvent) => {
      if (
        bypass.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (
        !link ||
        link.target === "_blank" ||
        link.hasAttribute("download") ||
        link.href === location.href ||
        link.getAttribute("href")?.startsWith("#")
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      request(() => {
        bypass.current = true;
        location.assign(link.href);
      });
    };
    const submit = (event: SubmitEvent) => {
      const form = event.target;
      if (bypass.current || !(form instanceof HTMLFormElement)) return;
      const clearSignOutDrafts = () => {
        if (!new URL(form.action).pathname.endsWith("/sign-out")) return;
        try {
          for (const key of Object.keys(sessionStorage)) {
            if (key.startsWith(`rp:clip-draft:${userId}:`)) sessionStorage.removeItem(key);
          }
        } catch {
          /* Storage can be disabled. */
        }
      };
      if (!dirty && !saving) {
        clearSignOutDrafts();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      request(() => {
        bypass.current = true;
        clearRecovery();
        clearSignOutDrafts();
        form.requestSubmit();
      });
    };
    if (dirty || saving) {
      window.addEventListener("beforeunload", beforeUnload);
      document.addEventListener("click", click, true);
    }
    document.addEventListener("submit", submit, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", submit, true);
    };
  }, [dirty, saving, request, clearRecovery, userId]);
  return {
    pending,
    request,
    cancel: () => {
      pendingRef.current = null;
      setPending(null);
    },
    discardAndLeave: () => {
      if (saving) return;
      discard();
      const action = pendingRef.current?.action;
      pendingRef.current = null;
      setPending(null);
      action?.();
    },
    saveAndLeave: async () => {
      if (await save()) {
        const action = pendingRef.current?.action;
        pendingRef.current = null;
        setPending(null);
        action?.();
      }
    },
  };
}
