import Link from "next/link";
import Image from "next/image";

import { cn } from "@/lib/utils";

interface BrandMarkProps {
  readonly className?: string;
  readonly compact?: boolean;
  readonly href?: string;
}

export function BrandMark({ className, compact = false, href }: BrandMarkProps) {
  const content = (
    <>
      <Image
        alt=""
        aria-hidden="true"
        className="size-9 rounded-rp-sm object-cover"
        height={36}
        src="/repurposepro-icon.png"
        width={36}
      />
      {!compact ? (
        <span className="text-base font-semibold tracking-[-0.04em]">
          Repurpose<span className="text-rp-primary">Pro</span>
        </span>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link
        aria-label="RepurposePro home"
        className={cn(
          "inline-flex items-center gap-3 text-rp-text transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rp-primary",
          className,
        )}
        href={href}
      >
        {content}
      </Link>
    );
  }

  return <div className={cn("flex items-center gap-3 text-rp-text", className)}>{content}</div>;
}
