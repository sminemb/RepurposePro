import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { localEmailOutboxPath, localServicesEnabled } from "@repurposepro/config";
import type { AccountEmailSender } from "./transactional-email";

export function createLocalAccountEmailSender(directory?: string): AccountEmailSender {
  if (!localServicesEnabled()) throw new Error("Local services are not enabled");
  const outbox = directory ?? localEmailOutboxPath();
  return async (message) => {
    await mkdir(outbox, { recursive: true, mode: 0o700 });
    await writeFile(
      join(outbox, `${Date.now()}-${randomUUID()}.json`),
      JSON.stringify({ ...message, createdAt: new Date().toISOString() }) + "\n",
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
  };
}
