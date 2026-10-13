import Link from "next/link";
import { notFound } from "next/navigation";
import type {
  AdminPage,
  AdminCreditLedgerEntry,
  AdminRecords,
  AdminUserDetail,
  ApiSuccess,
} from "@repurposepro/shared";
import {
  AdminDetail,
  AdminError,
  AdminHeading,
  AdminTable,
} from "@/features/admin/components/admin-views";
import { readAdmin } from "@/features/admin/server/admin-api";

export default async function AdminRecordPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ collection: string; recordId: string }>;
  readonly searchParams: Promise<{ cursor?: string; returnTo?: string }>;
}) {
  const { collection, recordId } = await params;
  const query = await searchParams;
  const backHref =
    typeof query.returnTo === "string" &&
    /^\/admin\/(?:users|projects|jobs|payments|search)(?:\?[^#]*)?$/.test(query.returnTo)
      ? query.returnTo
      : `/admin/${collection}`;
  const back = (
    <Link className="mb-5 inline-block text-rp-primary underline" href={backHref}>
      {backHref.startsWith("/admin/search?") ? "Back to results" : "Back to list"}
    </Link>
  );
  if (!["users", "projects", "jobs"].includes(collection)) notFound();
  const href = `/admin/${collection}/${encodeURIComponent(recordId)}`;
  const result = await readAdmin<
    ApiSuccess<AdminUserDetail | AdminRecords["projects"] | AdminRecords["jobs"]>
  >(`/${collection}/${encodeURIComponent(recordId)}`);
  if (!result.ok)
    return (
      <>
        {back}
        <AdminHeading title="Record details" />
        <AdminError message={result.message} href={href} />
      </>
    );
  if (collection === "users") {
    const detail = result.value.data as AdminUserDetail;
    const { cursor } = query;
    const detailQuery = new URLSearchParams();
    if (cursor) detailQuery.set("cursor", cursor);
    if (query.returnTo) detailQuery.set("returnTo", backHref);
    const ledgerQuery = new URLSearchParams({ userId: recordId });
    if (cursor) ledgerQuery.set("cursor", cursor);
    const ledger = cursor
      ? await readAdmin<AdminPage<AdminCreditLedgerEntry>>(`/ledger?${ledgerQuery}`)
      : { ok: true as const, value: detail.ledger };
    return (
      <>
        {back}
        <AdminHeading title="User details">{detail.user.email}</AdminHeading>
        <AdminDetail record={detail.user} />
        <div className="mt-8 space-y-8">
          {(["projects", "jobs", "payments"] as const).map((name) => (
            <section key={name}>
              <h2 className="mb-3 text-xl capitalize text-rp-text">{name}</h2>
              <AdminTable
                collection={name}
                page={detail[name]}
                href={`/admin/${name}?${new URLSearchParams({ userId: recordId })}`}
              />
            </section>
          ))}
          <section>
            <h2 className="mb-3 text-xl text-rp-text">Credit ledger</h2>
            {ledger.ok ? (
              <AdminTable
                collection="ledger"
                page={ledger.value}
                href={detailQuery.size ? `${href}?${detailQuery}` : href}
              />
            ) : (
              <AdminError
                message={ledger.message}
                href={`${href}?${new URLSearchParams({ cursor: cursor ?? "" })}`}
              />
            )}
          </section>
        </div>
      </>
    );
  }
  const record = result.value.data as AdminRecords["projects"] | AdminRecords["jobs"];
  return (
    <>
      {back}
      <AdminHeading title={collection === "projects" ? "Project details" : "Job details"} />
      <AdminDetail record={record} />
      {collection === "projects" ? (
        <Link
          className="mt-6 inline-block text-rp-primary underline"
          href={`/admin/jobs?${new URLSearchParams({ projectId: recordId })}`}
        >
          View project jobs
        </Link>
      ) : null}
    </>
  );
}
