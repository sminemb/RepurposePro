import Link from "next/link";
import type { AdminOverview, ApiSuccess } from "@repurposepro/shared";
import {
  AdminError,
  AdminHeading,
  adminControlClass,
} from "@/features/admin/components/admin-views";
import { readAdmin } from "@/features/admin/server/admin-api";

function paymentAmount(amount: number, currency: string): string {
  try {
    const format = new Intl.NumberFormat("en-US", { style: "currency", currency });
    return format.format(amount / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2));
  } catch {
    return `${amount} minor units (${currency})`;
  }
}

export default async function AdminPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ range?: string }>;
}) {
  const { range = "30d" } = await searchParams;
  const href = `/admin?${new URLSearchParams({ range })}`;
  const result = await readAdmin<ApiSuccess<AdminOverview>>(
    `/overview?${new URLSearchParams({ range })}`,
  );
  if (!result.ok)
    return (
      <>
        <AdminHeading title="Service overview" />
        <AdminError message={result.message} href={href} />
      </>
    );
  const overview = result.value.data;
  const metrics = [
    { title: "User signups", value: overview.usersCreated, href: "/admin/users" },
    { title: "Projects created", value: overview.projectsCreated, href: "/admin/projects" },
    {
      title: "Jobs created",
      value: overview.jobOutcomes.reduce((n, row) => n + row.count, 0),
      href: "/admin/jobs",
    },
    {
      title: "Payment records",
      value: overview.payments.reduce((n, row) => n + row.count, 0),
      href: "/admin/payments",
    },
  ];
  return (
    <>
      <AdminHeading title="Service overview">
        Activity for records created in the selected period. Statuses reflect their current saved
        state.
      </AdminHeading>
      <form className="mb-6 flex flex-wrap items-center gap-3">
        <label htmlFor="range" className="text-sm text-rp-text-muted">
          Historical range
        </label>
        <select className={adminControlClass} id="range" name="range" defaultValue={range}>
          {["7d", "30d", "90d"].map((value) => (
            <option key={value} value={value}>
              {value.slice(0, -1)} days
            </option>
          ))}
        </select>
        <button className={adminControlClass}>Apply range</button>
      </form>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Link
            key={metric.title}
            className="rounded-rp-lg border border-rp-border bg-rp-surface p-6 hover:border-rp-primary/50"
            href={metric.href}
          >
            <p className="text-sm text-rp-text-muted">{metric.title}</p>
            <p className="mt-3 text-4xl font-semibold text-rp-text">{metric.value}</p>
            <p className="mt-3 text-xs text-rp-primary">View records →</p>
          </Link>
        ))}
      </div>
      <section className="mt-8 rounded-rp-lg border border-rp-border bg-rp-surface p-6">
        <h2 className="text-lg font-semibold text-rp-text">Current processing</h2>
        <p className="mt-2 text-sm text-rp-text-muted">
          Current persisted queue state, across all dates.
        </p>
        <div className="mt-4 flex flex-wrap gap-6">
          {(["queued", "active"] as const).map((status) => (
            <Link
              key={status}
              href={`/admin/jobs?status=${status}`}
              className="text-rp-primary underline"
            >
              {status}: {overview.currentQueue[status]}
            </Link>
          ))}
        </div>
      </section>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-rp-lg border border-rp-border p-6">
          <h2 className="text-lg font-semibold text-rp-text">Job outcomes</h2>
          {overview.jobOutcomes.length ? (
            <ul className="mt-4 space-y-3">
              {overview.jobOutcomes.map((row) => (
                <li key={row.status}>
                  <Link
                    className="text-rp-primary underline"
                    href={`/admin/jobs?status=${row.status}`}
                  >
                    {row.status}: {row.count}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-rp-text-muted">No jobs created in this period.</p>
          )}
        </section>
        <section className="rounded-rp-lg border border-rp-border p-6">
          <h2 className="text-lg font-semibold text-rp-text">Payments by currency and status</h2>
          {overview.payments.length ? (
            <ul className="mt-4 space-y-4">
              {overview.payments.map((row) => (
                <li key={`${row.currency}-${row.status}`} className="text-sm text-rp-text">
                  <Link
                    className="text-rp-primary underline"
                    href={`/admin/payments?status=${row.status}`}
                  >
                    {row.status} · {row.count} records
                  </Link>
                  <p className="mt-1">{paymentAmount(row.amountCents, row.currency)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-rp-text-muted">No payments created in this period.</p>
          )}
        </section>
      </div>
    </>
  );
}
