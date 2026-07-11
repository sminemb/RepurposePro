import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-rp-md border border-rp-border bg-rp-surface px-3 py-2 text-sm text-rp-text outline-none transition-colors placeholder:text-rp-text-disabled focus:border-rp-primary focus:ring-2 focus:ring-rp-primary/30 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
