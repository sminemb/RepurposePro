import type { Pool } from "pg";

/** Wait for physical connection closure before deleting an integration-test database. */
export async function closeTestPool(pool: Pool): Promise<void> {
  let remaining = pool.totalCount;
  if (remaining === 0) {
    await pool.end();
    return;
  }

  let resolveRemoved!: () => void;
  const removed = new Promise<void>((resolve) => {
    resolveRemoved = resolve;
  });
  const onRemove = () => {
    remaining -= 1;
    if (remaining === 0) resolveRemoved();
  };
  pool.on("remove", onRemove);
  try {
    // pg-pool can resolve end() before its clients emit remove/finish closing.
    await pool.end();
    await removed;
  } finally {
    pool.off("remove", onRemove);
  }
}
