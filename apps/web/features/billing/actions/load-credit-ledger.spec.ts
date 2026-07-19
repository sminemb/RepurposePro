import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCreditLedgerMock } = vi.hoisted(() => ({ getCreditLedgerMock: vi.fn() }));

vi.mock("../server/billing-api", () => ({ getCreditLedger: getCreditLedgerMock }));

import { loadCreditLedger } from "./load-credit-ledger";

describe("loadCreditLedger", () => {
  beforeEach(() => {
    getCreditLedgerMock.mockReset();
  });

  it("returns an authenticated ledger page for the requested opaque cursor", async () => {
    const page = {
      data: [
        {
          amount: 40,
          createdAt: "2026-07-19T00:10:00.000Z",
          description: "Purchased Starter credits",
          id: "00000000-0000-0000-0000-000000000001",
          projectId: null,
          type: "purchase" as const,
        },
      ],
      meta: { nextCursor: null },
    };
    getCreditLedgerMock.mockResolvedValue({ kind: "success", page });
    const formData = new FormData();
    formData.set("cursor", "opaque-cursor");

    await expect(loadCreditLedger({ error: null, page: null }, formData)).resolves.toEqual({
      error: null,
      page,
    });
    expect(getCreditLedgerMock).toHaveBeenCalledWith({ cursor: "opaque-cursor" });
  });

  it("keeps current UI data intact by returning an error instead of a fabricated page", async () => {
    getCreditLedgerMock.mockResolvedValue({
      kind: "unavailable",
      message: "We could not load your credit history. Refresh the page to try again.",
    });
    const formData = new FormData();
    formData.set("cursor", "opaque-cursor");

    await expect(loadCreditLedger({ error: null, page: null }, formData)).resolves.toEqual({
      error: "We could not load your credit history. Refresh the page to try again.",
      page: null,
    });
  });
});
