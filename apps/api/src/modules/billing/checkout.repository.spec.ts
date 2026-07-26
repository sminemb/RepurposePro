import { describe, expect, it, vi } from "vitest";

import { CheckoutRepository } from "./checkout.repository";

describe("CheckoutRepository", () => {
  it("creates, attaches, and fails Checkout attempts only through scoped functions", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ attemptId: "attempt-1", idempotencyKey: "stripe-checkout:attempt-1" }],
      })
      .mockResolvedValue({ rows: [] });
    const repository = new CheckoutRepository({
      database: { pool: { query } },
    } as never);

    await expect(
      repository.createAttempt("user-1", "creator", "price_creator", false),
    ).resolves.toEqual({
      attemptId: "attempt-1",
      idempotencyKey: "stripe-checkout:attempt-1",
    });

    const expiresAt = new Date("2030-01-01T00:00:00.000Z");
    await repository.attach("attempt-1", "cs_test_1", expiresAt);
    await repository.fail("attempt-1");

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("public.create_stripe_checkout_attempt($1, $2, $3, $4)"),
      ["user-1", "creator", "price_creator", false],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      "SELECT public.attach_stripe_checkout_session($1, $2, $3)",
      ["attempt-1", "cs_test_1", expiresAt],
    );
    expect(query).toHaveBeenNthCalledWith(3, "SELECT public.fail_stripe_checkout_attempt($1)", [
      "attempt-1",
    ]);
  });

  it("fails closed when attempt creation does not return exactly one row", async () => {
    const repository = new CheckoutRepository({
      database: { pool: { query: vi.fn().mockResolvedValue({ rows: [] }) } },
    } as never);

    await expect(
      repository.createAttempt("user-1", "starter", "price_starter", false),
    ).rejects.toThrow("Checkout attempt did not return one result.");
  });
});
