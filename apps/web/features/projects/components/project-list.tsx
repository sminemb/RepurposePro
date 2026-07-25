import type { ProjectSummary } from "@repurposepro/shared";
import { Clapperboard, FileVideo, Plus } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";

import { getProjectCardAction } from "./project-card-action";

interface ProjectListProps {
  readonly projects: readonly ProjectSummary[];
}

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

export function ProjectList({ projects }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <EmptyState
        action={
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-rp-md bg-rp-primary px-4 text-sm font-semibold text-rp-primary-foreground hover:bg-rp-primary-hover"
            href="/projects/new"
          >
            <Plus aria-hidden="true" className="size-4" /> Create your first project
          </Link>
        }
        description="Create a clips or summary project, then upload your source video in the next step."
        icon={<Clapperboard aria-hidden="true" className="size-7" />}
        title="No projects yet"
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => {
        const Icon = project.outputType === "clips" ? Clapperboard : FileVideo;
        const outputLabel = project.outputType === "clips" ? "Short clips" : "Summary video";
        const action = getProjectCardAction(project.id, project.status);

        return (
          <article
            className="flex min-h-56 flex-col rounded-rp-lg border border-rp-border bg-rp-surface/75 p-5"
            key={project.id}
          >
            <div className="flex items-start justify-between gap-4">
              <span className="grid size-11 place-items-center rounded-rp-md border border-rp-primary/25 bg-rp-primary-soft text-rp-primary">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <StatusBadge status={project.status} />
            </div>
            <h2 className="mt-5 text-lg font-semibold text-rp-text">{project.name}</h2>
            <p className="mt-2 text-sm text-rp-text-muted">{outputLabel}</p>
            <div className="mt-auto border-t border-rp-border pt-4 text-xs leading-5 text-rp-text-muted">
              <p>Created {formatCreatedAt(project.createdAt)}</p>
              <Link
                className="mt-3 inline-flex min-h-9 items-center text-sm font-semibold text-rp-primary hover:text-rp-text"
                href={action.href}
              >
                {action.label}
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}
