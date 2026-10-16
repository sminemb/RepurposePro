"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function PasswordInput({
  className,
  disabled,
  visibilityLabel = "password",
  ...props
}: Omit<ComponentProps<typeof Input>, "type"> & { readonly visibilityLabel?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        className={cn("h-11 pr-12", className)}
        disabled={disabled}
        type={visible ? "text" : "password"}
      />
      <button
        aria-controls={props.id}
        aria-label={`${visible ? "Hide" : "Show"} ${visibilityLabel}`}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 grid min-w-11 place-items-center text-rp-text-muted hover:text-rp-text focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-rp-primary disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        type="button"
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? (
          <EyeOff aria-hidden="true" className="size-4" />
        ) : (
          <Eye aria-hidden="true" className="size-4" />
        )}
      </button>
    </div>
  );
}
