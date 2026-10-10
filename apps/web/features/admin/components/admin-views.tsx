import Link from "next/link";
import type { ReactNode } from "react";
import type { AdminCollection, AdminPage, AdminRecords } from "@repurposepro/shared";

export const adminControlClass =
  "min-h-11 rounded-rp-md border border-rp-border bg-rp-surface px-4 py-2 text-rp-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rp-primary";
export function AdminError({ message, href }: { readonly message: string; readonly href: string }) {
  return (
    <section
      role="alert"
      className="rounded-rp-lg border border-rp-danger/35 bg-rp-danger-soft/35 p-5 text-rp-text"
    >
      <p>{message}</p>
      <a href={href} className="mt-3 inline-block text-rp-primary underline">
        Try again
      </a>
      <Link href="/admin" className="ml-5 text-rp-primary underline">
        Back to overview
      </Link>
    </section>
  );
}
export function AdminHeading({
  title,
  children,
}: {
  readonly title: string;
  readonly children?: ReactNode;
}) {
  return (
    <header className="mb-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-rp-primary">
        Operations
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-rp-text">{title}</h1>
      {children ? (
        <div className="mt-3 text-sm leading-6 text-rp-text-muted">{children}</div>
      ) : null}
    </header>
  );
}
const labels: Record<string, string> = {
  id: "ID",
  userId: "User",
  projectId: "Project",
  currentJobId: "Current job",
  createdAt: "Created",
  updatedAt: "Updated",
  deletedAt: "Deleted",
  startedAt: "Started",
  completedAt: "Completed",
  outputType: "Output type",
  attemptCount: "Attempts",
  errorCode: "Failure code",
  amountCents: "Amount (minor units)",
  amount: "Credits",
};
function cell(key: string, value: unknown): ReactNode {
  if (value === null || value === undefined) return "—";
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")
    return "—";
  const text = String(value);
  const target =
    key === "userId"
      ? "users"
      : key === "projectId"
        ? "projects"
        : key === "currentJobId"
          ? "jobs"
          : null;
  if (target)
    return (
      <Link
        className="text-rp-primary underline break-all"
        href={`/admin/${target}/${encodeURIComponent(text)}`}
      >
        {text}
      </Link>
    );
  if (key.endsWith("At"))
    return (
      <time dateTime={text}>{new Date(text).toLocaleString("en-US", { timeZone: "UTC" })} UTC</time>
    );
  return <span className="break-all">{text}</span>;
}
const columns = {
  users: ["id", "name", "email", "createdAt"],
  projects: ["id", "userId", "outputType", "status", "createdAt"],
  jobs: ["id", "userId", "projectId", "type", "status", "step", "createdAt"],
  payments: ["userId", "amountCents", "currency", "status", "createdAt"],
  ledger: ["type", "amount", "createdAt"],
} as const;
export function AdminTable<C extends AdminCollection>({
  collection,
  page,
  href,
  returnTo,
}: {
  readonly collection: C;
  readonly page: AdminPage<AdminRecords[C]>;
  readonly href: string;
  readonly returnTo?: string;
}) {
  const fields = columns[collection];
  const url = new URL(href, "http://admin.local");
  if (page.meta.nextCursor) url.searchParams.set("cursor", page.meta.nextCursor);
  return (
    <section className="min-w-0">
      {page.data.length ? (
        <div
          className="overflow-x-auto rounded-rp-lg border border-rp-border bg-rp-surface focus-visible:outline-2 focus-visible:outline-rp-primary"
          role="region"
          aria-label={`${collection} records`}
          tabIndex={0}
        >
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{collection} records</caption>
            <thead className="bg-rp-card text-rp-text-muted">
              <tr>
                {fields.map((key) => (
                  <th key={key} scope="col" className="px-4 py-3 font-medium capitalize">
                    {labels[key] ?? key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-rp-border text-rp-text">
              {page.data.map((row) => (
                <tr key={row.id}>
                  {fields.map((key) => (
                    <td className="min-w-28 max-w-72 px-4 py-4 align-top" key={key}>
                      {key === "id" && ["users", "projects", "jobs"].includes(collection) ? (
                        <Link
                          className="break-all text-rp-primary underline"
                          href={`/admin/${collection}/${encodeURIComponent(row.id)}?${new URLSearchParams({ returnTo: returnTo ?? href })}`}
                        >
                          {row.id}
                        </Link>
                      ) : (
                        cell(key, (row as unknown as Record<string, unknown>)[key])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p role="status" className="rounded-rp-lg border border-rp-border p-6 text-rp-text-muted">
          No {collection} found.
        </p>
      )}
      <div className="mt-4 flex gap-4">
        {page.meta.nextCursor ? (
          <Link className={adminControlClass} href={`${url.pathname}${url.search}`}>
            Next page
          </Link>
        ) : null}
        {new URL(href, "http://admin.local").searchParams.has("cursor") ? (
          <Link
            className={adminControlClass}
            href={(() => {
              const first = new URL(href, "http://admin.local");
              first.searchParams.delete("cursor");
              return `${first.pathname}${first.search}`;
            })()}
          >
            First page
          </Link>
        ) : null}
      </div>
    </section>
  );
}
export function AdminDetail({
  record,
}: {
  readonly record: AdminRecords["users"] | AdminRecords["projects"] | AdminRecords["jobs"];
}) {
  return (
    <dl className="grid gap-x-8 gap-y-4 rounded-rp-lg border border-rp-border bg-rp-surface p-6 sm:grid-cols-2 xl:grid-cols-3">
      {Object.entries(record)
        .filter(([key]) =>
          [
            "id",
            "name",
            "email",
            "userId",
            "projectId",
            "currentJobId",
            "outputType",
            "type",
            "status",
            "step",
            "errorCode",
            "attemptCount",
            "createdAt",
            "updatedAt",
            "startedAt",
            "completedAt",
            "deletedAt",
          ].includes(key),
        )
        .map(([key, value]) => (
          <div key={key} className="min-w-0">
            <dt className="text-xs capitalize text-rp-text-muted">{labels[key] ?? key}</dt>
            <dd className="mt-1 text-sm text-rp-text">{cell(key, value)}</dd>
          </div>
        ))}
    </dl>
  );
}
