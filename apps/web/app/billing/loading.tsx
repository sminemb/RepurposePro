export default function BillingLoading() {
  return (
    <main className="mx-auto max-w-[90rem] px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
      <div className="h-10 w-36 animate-pulse rounded-rp-sm bg-rp-card" />
      <div className="mt-3 h-6 max-w-xl animate-pulse rounded-rp-sm bg-rp-card" />
      <div className="mt-9 h-64 animate-pulse rounded-rp-lg border border-rp-border bg-rp-card" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {["starter", "creator", "pro"].map((pack) => (
          <div
            className="h-76 animate-pulse rounded-rp-lg border border-rp-border bg-rp-card"
            key={pack}
          />
        ))}
      </div>
    </main>
  );
}
