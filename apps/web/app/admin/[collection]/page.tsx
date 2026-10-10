import type { AdminCollection, AdminPage, AdminRecords } from "@repurposepro/shared";
import { notFound } from "next/navigation";
import {
  AdminError,
  AdminHeading,
  AdminTable,
  adminControlClass,
} from "@/features/admin/components/admin-views";
import { readAdmin } from "@/features/admin/server/admin-api";

export default async function AdminListPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ collection: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { collection: name } = await params;
  if (!["users", "projects", "jobs", "payments"].includes(name)) notFound();
  const collection = name as Exclude<AdminCollection, "ledger">;
  const search = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (Array.isArray(value)) for (const part of value) query.append(key, part);
    else if (value !== undefined) query.set(key, value);
  }
  if (query.get("status") === "") query.delete("status");
  const href = `/admin/${collection}${query.size ? `?${query}` : ""}`;
  const result = await readAdmin<AdminPage<AdminRecords[typeof collection]>>(
    `/${collection}?${query}`,
  );
  const statuses =
    collection === "jobs"
      ? ["queued", "active", "completed", "failed", "refunded", "cancelled"]
      : collection === "payments"
        ? ["pending", "paid", "failed", "refunded"]
        : [];
  return (
    <>
      <AdminHeading title={`${collection[0]!.toUpperCase()}${collection.slice(1)}`}>
        Newest records first. Follow an identifier to inspect its safe metadata.
      </AdminHeading>
      {statuses.length ? (
        <form className="mb-6 flex flex-wrap items-center gap-3">
          <label htmlFor="status" className="text-sm text-rp-text-muted">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={typeof search.status === "string" ? search.status : ""}
            className={adminControlClass}
          >
            <option value="">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          {["userId", "projectId"].map((key) =>
            typeof search[key] === "string" ? (
              <input key={key} type="hidden" name={key} value={search[key]} />
            ) : null,
          )}
          <button className={adminControlClass}>Apply filter</button>
        </form>
      ) : null}
      {result.ok ? (
        <AdminTable collection={collection} page={result.value} href={href} />
      ) : (
        <AdminError message={result.message} href={href} />
      )}
    </>
  );
}
