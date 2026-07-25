import type { ProjectStatus } from "@repurposepro/shared";

import { Badge } from "@/components/ui/badge";
import { getProjectStatusPresentation } from "./status-badge-config";

export function StatusBadge({ status }: { readonly status: ProjectStatus }) {
  const presentation = getProjectStatusPresentation(status);
  const Icon = presentation.icon;

  return (
    <Badge className={presentation.className} variant="outline">
      <Icon aria-hidden="true" /> {presentation.label}
    </Badge>
  );
}

export { getProjectStatusPresentation } from "./status-badge-config";
