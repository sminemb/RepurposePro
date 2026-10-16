import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const enabled = vi.hoisted(() => vi.fn(() => true));
vi.mock("server-only", () => ({}));
vi.mock("@repurposepro/config", () => ({
  localServicesEnabled: enabled,
  localEmailOutboxPath: () => {
    throw new Error("Test must use an isolated outbox");
  },
}));
import { createLocalAccountEmailSender } from "./local-account-email";

afterEach(() => {
  enabled.mockReturnValue(true);
  vi.restoreAllMocks();
});

describe("local account email", () => {
  it("writes reset links to a private outbox without contacting an email provider", async () => {
    const directory = await mkdtemp(join(tmpdir(), "repurposepro-mail-"));
    if (dirname(resolve(directory)) !== resolve(tmpdir()))
      throw new Error("Unexpected outbox path");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const message = {
        kind: "reset",
        to: "local@example.test",
        url: "http://localhost:3000/reset-password?token=local-only",
      } as const;
      await createLocalAccountEmailSender(directory)(message);
      const files = await readdir(directory);
      expect(files).toHaveLength(1);
      expect(JSON.parse(await readFile(join(directory, files[0]!), "utf8"))).toMatchObject(message);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("refuses local delivery when isolated development is not enabled", () => {
    enabled.mockReturnValue(false);
    expect(() => createLocalAccountEmailSender("unused")).toThrow("Local services are not enabled");
  });
});
