import { EventEmitter } from "node:events";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { closeTestPool } from "./close-test-pool";

function testPool(totalCount: number) {
  return Object.assign(new EventEmitter(), {
    totalCount,
    end: vi.fn(async () => {}),
  });
}

describe("integration pool teardown", () => {
  it("waits for every physical connection after end resolves", async () => {
    const pool = testPool(2);
    let closed = false;
    const closing = closeTestPool(pool as unknown as Pool).then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(pool.end).toHaveBeenCalledOnce();
    expect(closed).toBe(false);
    pool.emit("remove");
    await Promise.resolve();
    expect(closed).toBe(false);
    pool.emit("remove");
    await closing;
    expect(closed).toBe(true);
    expect(pool.listenerCount("remove")).toBe(0);
  });

  it("closes an empty pool without waiting for events", async () => {
    const pool = testPool(0);
    await closeTestPool(pool as unknown as Pool);
    expect(pool.end).toHaveBeenCalledOnce();
    expect(pool.listenerCount("remove")).toBe(0);
  });

  it("propagates shutdown failure and removes its listener", async () => {
    const pool = testPool(1);
    pool.end.mockRejectedValue(new Error("shutdown failed"));
    await expect(closeTestPool(pool as unknown as Pool)).rejects.toThrow("shutdown failed");
    expect(pool.listenerCount("remove")).toBe(0);
  });
});
