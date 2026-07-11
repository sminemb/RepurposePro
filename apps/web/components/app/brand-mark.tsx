import { cn } from "@/lib/utils";

interface BrandMarkProps {
  readonly className?: string;
  readonly compact?: boolean;
}

export function BrandMark({ className, compact = false }: BrandMarkProps) {
  return (
    <div className={cn("flex items-center gap-3 text-rp-text", className)}>
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-rp-sm border border-rp-primary/50 bg-rp-primary-soft font-bold text-rp-primary shadow-rp-glow"
      >
        RP
      </span>
      {!compact ? (
        <span className="text-sm font-semibold tracking-[-0.03em]">
          Repurpose<span className="text-rp-primary">Pro</span>
        </span>
      ) : null}
    </div>
  );
}
