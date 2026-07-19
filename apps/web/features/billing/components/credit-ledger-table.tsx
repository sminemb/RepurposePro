"use client";

import type { CreditLedgerEntry, CreditLedgerPage } from "@repurposepro/shared";
import { LoaderCircle, ReceiptText } from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import { loadCreditLedger, type LoadCreditLedgerState } from "../actions/load-credit-ledger";
import { formatCreditLedgerAmount, formatCreditLedgerType } from "./billing-format";

interface CreditLedgerTableProps {
  readonly initialPage: CreditLedgerPage;
}

const initialLoadState: LoadCreditLedgerState = { error: null, page: null };

export function CreditLedgerTable({ initialPage }: CreditLedgerTableProps) {
  const [entries, setEntries] = useState<readonly CreditLedgerEntry[]>(initialPage.data);
  const [nextCursor, setNextCursor] = useState(initialPage.meta.nextCursor);
  const [loadState, loadAction, isPending] = useActionState(loadCreditLedger, initialLoadState);

  useEffect(() => {
    const loadedPage = loadState.page;
    if (!loadedPage) {
      return;
    }

    setEntries((currentEntries) => {
      const loadedIds = new Set(currentEntries.map((entry) => entry.id));
      return [...currentEntries, ...loadedPage.data.filter((entry) => !loadedIds.has(entry.id))];
    });
    setNextCursor(loadedPage.meta.nextCursor);
  }, [loadState.page]);

  if (entries.length === 0) {
    return (
      <div className="rounded-rp-lg border border-rp-border bg-rp-card px-5 py-10 text-center shadow-rp-card sm:px-7">
        <span className="mx-auto grid size-11 place-items-center rounded-rp-md border border-rp-primary/30 bg-rp-primary-soft text-rp-primary">
          <ReceiptText aria-hidden="true" className="size-5" />
        </span>
        <h3 className="mt-5 text-base font-semibold text-rp-text">No credit transactions yet</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-rp-text-muted">
          Purchase credits to start processing videos. Your transactions appear here once confirmed.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-hidden rounded-rp-lg border border-rp-border bg-rp-card shadow-rp-card">
        <div className="md:hidden">
          <ul className="divide-y divide-rp-border" aria-label="Credit transaction history">
            {entries.map((entry) => (
              <li className="p-5" key={entry.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-rp-text">
                      {formatCreditLedgerType(entry.type)}
                    </p>
                    <p className="mt-1 text-sm text-rp-text-muted">
                      {formatLedgerDate(entry.createdAt)}
                    </p>
                  </div>
                  <p className={amountClassName(entry.amount)}>
                    {formatCreditLedgerAmount(entry.amount)}
                  </p>
                </div>
                <p className="mt-4 text-sm leading-6 text-rp-text-muted">{entry.description}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-160 border-collapse text-left text-sm">
            <thead className="border-b border-rp-border bg-rp-surface text-xs font-semibold tracking-[0.12em] text-rp-text-muted uppercase">
              <tr>
                <th className="px-6 py-4" scope="col">
                  Date
                </th>
                <th className="px-6 py-4" scope="col">
                  Type
                </th>
                <th className="px-6 py-4 text-right" scope="col">
                  Amount
                </th>
                <th className="px-6 py-4" scope="col">
                  Description
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rp-border">
              {entries.map((entry) => (
                <tr className="align-top" key={entry.id}>
                  <td className="whitespace-nowrap px-6 py-5 text-rp-text-muted">
                    {formatLedgerDate(entry.createdAt)}
                  </td>
                  <td className="px-6 py-5 font-medium text-rp-text">
                    {formatCreditLedgerType(entry.type)}
                  </td>
                  <td className={amountClassName(entry.amount, "px-6 py-5 text-right")}>
                    {formatCreditLedgerAmount(entry.amount)}
                  </td>
                  <td className="px-6 py-5 leading-6 text-rp-text-muted">{entry.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {nextCursor ? (
        <div className="mt-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p aria-live="polite" className="text-sm text-rp-text-muted" role="status">
            {isPending ? "Loading more transactions…" : `${entries.length} transactions shown`}
          </p>
          <form action={loadAction}>
            <input name="cursor" type="hidden" value={nextCursor} />
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-rp-md border border-rp-border px-4 text-sm font-semibold text-rp-text transition-colors hover:border-rp-primary/50 hover:bg-rp-surface disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rp-primary"
              disabled={isPending}
              type="submit"
            >
              {isPending ? (
                <>
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Loading
                </>
              ) : (
                "Load more"
              )}
            </button>
          </form>
        </div>
      ) : (
        <p className="mt-5 text-sm text-rp-text-muted" role="status">
          All transactions shown
        </p>
      )}

      {loadState.error ? (
        <p aria-live="assertive" className="mt-3 text-sm leading-6 text-rp-danger" role="alert">
          {loadState.error}
        </p>
      ) : null}
    </div>
  );
}

function amountClassName(amount: number, className = ""): string {
  return `${className} whitespace-nowrap font-semibold tabular-nums ${
    amount > 0 ? "text-rp-primary" : "text-rp-danger"
  }`.trim();
}

function formatLedgerDate(value: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(value),
  );
}
