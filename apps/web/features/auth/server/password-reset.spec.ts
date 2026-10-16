import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAccountSettingsOptions } from "../../settings/server/account-settings-auth";
import type { AccountEmail } from "../../settings/server/transactional-email";
import { createPasswordResetOptions } from "./password-reset";

afterEach(() => vi.useRealTimers());

async function setup(emailAvailable = true) {
  const messages: AccountEmail[] = [];
  const tasks: (() => Promise<void>)[] = [];
  const send = vi.fn(async (message: AccountEmail) => {
    messages.push(message);
  });
  const auth = betterAuth({
    ...createAccountSettingsOptions(send, emailAvailable, "http://localhost:3000"),
    baseURL: "http://localhost:3000",
    secret: "reset-integration-secret-at-least-32-characters",
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    logger: { disabled: true },
    emailAndPassword: {
      enabled: true,
      ...createPasswordResetOptions(send, (task) => {
        tasks.push(task);
      }),
    },
  });
  async function request(path: string, body?: Record<string, unknown>, cookie = "") {
    return auth.handler(
      new Request(new URL(path, "http://localhost:3000/api/auth/"), {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
          Cookie: cookie,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  }
  function cookies(response: Response) {
    return response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
  }
  const signup = await request("sign-up/email", {
    name: "Creator",
    email: "creator@example.com",
    password: "old-password",
  });
  expect(signup.status).toBe(200);
  const cookie = cookies(signup);
  async function recoveryLink() {
    expect(
      (
        await request("request-password-reset", {
          email: "creator@example.com",
          redirectTo: "/unexpected",
        })
      ).status,
    ).toBe(200);
    await tasks.at(-1)!();
    return messages.at(-1)!.url;
  }
  async function token() {
    const response = await request(await recoveryLink());
    return new URL(response.headers.get("location")!).searchParams.get("token")!;
  }
  return { request, cookie, cookies, send, tasks, messages, recoveryLink, token };
}

describe("forgotten password with real Better Auth", { timeout: 30_000 }, () => {
  it("returns identical responses for existing and unknown emails and schedules delivery", async () => {
    const { request, tasks, messages } = await setup();
    const known = await request("request-password-reset", { email: "creator@example.com" });
    const unknown = await request("request-password-reset", { email: "unknown@example.com" });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());
    expect(messages).toEqual([]);
    expect(tasks).toHaveLength(1);
    await tasks[0]!();
    expect(messages[0]).toMatchObject({ kind: "reset", to: "creator@example.com" });
    expect(new URL(messages[0]!.url).searchParams.get("callbackURL")).toBe(
      "http://localhost:3000/reset-password",
    );
  });

  it("rejects unavailable email delivery uniformly before scheduling", async () => {
    const { request, tasks } = await setup(false);
    for (const email of ["creator@example.com", "unknown@example.com"]) {
      const response = await request("request-password-reset", { email });
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ code: "EMAIL_DELIVERY_UNAVAILABLE" });
    }
    expect(tasks).toEqual([]);
  });

  it("resets once, rejects the old password, and revokes all sessions", async () => {
    const { request, cookie, cookies, token } = await setup();
    const second = cookies(
      await request("sign-in/email", { email: "creator@example.com", password: "old-password" }),
    );
    const resetToken = await token();
    expect(
      (await request("reset-password", { token: resetToken, newPassword: "new-password" })).status,
    ).toBe(200);
    for (const session of [cookie, second])
      expect(await (await request("get-session", undefined, session)).json()).toBeNull();
    expect(
      (await request("sign-in/email", { email: "creator@example.com", password: "old-password" }))
        .status,
    ).toBe(401);
    expect(
      (await request("sign-in/email", { email: "creator@example.com", password: "new-password" }))
        .status,
    ).toBe(200);
    expect(
      (await request("reset-password", { token: resetToken, newPassword: "another-password" }))
        .status,
    ).toBe(400);
  });

  it("rejects expired and invalid links and keeps tokens usable after invalid password length", async () => {
    const { request, recoveryLink, token } = await setup();
    const resetToken = await token();
    for (const newPassword of ["short", "a".repeat(129)])
      expect((await request("reset-password", { token: resetToken, newPassword })).status).toBe(
        400,
      );
    expect(
      (await request("reset-password", { token: resetToken, newPassword: "valid-password" }))
        .status,
    ).toBe(200);
    const link = await recoveryLink();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 3_601_000);
    const expired = await request(link);
    expect(expired.headers.get("location")).toBe(
      "http://localhost:3000/reset-password?error=INVALID_TOKEN",
    );
    expect(
      (
        await request("reset-password", {
          token: new URL(link).pathname.split("/").at(-1),
          newPassword: "valid-password",
        })
      ).status,
    ).toBe(400);
    expect(
      (await request("reset-password", { token: "invalid", newPassword: "valid-password" })).status,
    ).toBe(400);
  });

  it("contains provider failures without logging private data", async () => {
    const { request, send, tasks } = await setup();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    send.mockRejectedValueOnce(new Error("private-provider-error"));
    try {
      expect(
        (await request("request-password-reset", { email: "creator@example.com" })).status,
      ).toBe(200);
      await expect(tasks[0]!()).resolves.toBeUndefined();
      expect(log).toHaveBeenCalledWith(JSON.stringify({ event: "password_reset_email_failed" }));
    } finally {
      log.mockRestore();
    }
  });
});
