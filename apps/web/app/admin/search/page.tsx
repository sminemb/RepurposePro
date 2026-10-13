import type { AdminSearchResult, ApiSuccess } from "@repurposepro/shared";
import {
  AdminError,
  AdminHeading,
  AdminTable,
  adminControlClass,
} from "@/features/admin/components/admin-views";
import { readAdmin } from "@/features/admin/server/admin-api";

export default async function AdminSearchPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = new URLSearchParams({ q });
  const result = q ? await readAdmin<ApiSuccess<AdminSearchResult>>(`/search?${query}`) : null;
  return (
    <>
      <AdminHeading title="Exact lookup">
        Enter one complete email address or user, project, or job ID.
      </AdminHeading>
      <form className="mb-8 flex max-w-2xl flex-wrap gap-3" action="/admin/search">
        <label className="sr-only" htmlFor="admin-query">
          Email address or ID
        </label>
        <input
          className={`${adminControlClass} min-w-0 flex-1`}
          id="admin-query"
          name="q"
          defaultValue={q}
          required
          maxLength={320}
          autoComplete="off"
          placeholder="Email address or ID"
        />
        <button className={adminControlClass}>Search</button>
      </form>
      {result && !result.ok ? (
        <AdminError message={result.message} href={`/admin/search?${query}`} />
      ) : result?.ok ? (
        <div className="space-y-8">
          {(["users", "projects", "jobs"] as const).map((collection) => (
            <section key={collection}>
              <h2 className="mb-3 text-xl capitalize text-rp-text">{collection}</h2>
              <AdminTable
                collection={collection}
                page={{ data: result.value.data[collection], meta: { nextCursor: null } }}
                href={`/admin/${collection}`}
                returnTo={`/admin/search?${query}`}
              />
            </section>
          ))}
        </div>
      ) : (
        <p className="text-rp-text-muted">Partial names and content searches are not supported.</p>
      )}
    </>
  );
}
