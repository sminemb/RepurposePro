import type { ProjectStatus } from "@repurposepro/shared";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock3,
  FilePenLine,
  RotateCcw,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export interface StatusPresentation {
  readonly className: string;
  readonly icon: LucideIcon;
  readonly label: string;
}

const statusPresentations: Record<ProjectStatus, StatusPresentation> = {
  analyzing: {
    className: "border-rp-primary/35 bg-rp-primary-soft text-rp-primary",
    icon: Sparkles,
    label: "Analyzing",
  },
  completed: {
    className: "border-rp-success/35 bg-rp-success-soft text-rp-success",
    icon: CheckCircle2,
    label: "Completed",
  },
  deleted: {
    className: "border-rp-border bg-rp-card text-rp-text-disabled",
    icon: CircleDashed,
    label: "Deleted",
  },
  draft: {
    className: "border-rp-border-strong bg-rp-card text-rp-text-muted",
    icon: FilePenLine,
    label: "Draft",
  },
  failed: {
    className: "border-rp-danger/35 bg-rp-danger-soft text-rp-danger",
    icon: AlertTriangle,
    label: "Failed",
  },
  preview_ready: {
    className: "border-rp-success/35 bg-rp-success-soft text-rp-success",
    icon: CheckCircle2,
    label: "Preview ready",
  },
  queued: {
    className: "border-rp-primary/35 bg-rp-primary-soft text-rp-primary",
    icon: Clock3,
    label: "Queued",
  },
  refunded: {
    className: "border-rp-border-strong bg-rp-card text-rp-text-secondary",
    icon: RotateCcw,
    label: "Refunded",
  },
  rendering: {
    className: "border-rp-primary/35 bg-rp-primary-soft text-rp-primary",
    icon: Sparkles,
    label: "Rendering",
  },
  transcribing: {
    className: "border-rp-primary/35 bg-rp-primary-soft text-rp-primary",
    icon: Sparkles,
    label: "Transcribing",
  },
  uploaded: {
    className: "border-rp-border-strong bg-rp-card text-rp-text-secondary",
    icon: CheckCircle2,
    label: "Uploaded",
  },
  waiting_for_payment: {
    className: "border-rp-border-strong bg-rp-card text-rp-text-secondary",
    icon: Clock3,
    label: "Payment needed",
  },
  waiting_for_user_edits: {
    className: "border-rp-border-strong bg-rp-card text-rp-text-secondary",
    icon: FilePenLine,
    label: "Needs edits",
  },
};

export function getProjectStatusPresentation(status: ProjectStatus): StatusPresentation {
  return statusPresentations[status];
}
