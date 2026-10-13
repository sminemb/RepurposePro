// Loaded only through the disposable E2E web build's alias.
import { appendFile } from "node:fs/promises";
import { join } from "node:path";

export function createTransactionalEmailSender() {
  if (process.env.APP_ENV !== "test" || !process.env.E2E_RUN_ROOT)
    throw new Error("Email fixture requires an isolated E2E environment.");
  return async (message) => {
    await appendFile(
      join(process.env.E2E_RUN_ROOT, "account-mail.jsonl"),
      `${JSON.stringify(message)}\n`,
    );
  };
}
