import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAccountSettingsOptions } from "./account-settings-auth";
import type { AccountEmail } from "./transactional-email";

afterEach(() => vi.useRealTimers());

async function setup() {
  const messages: AccountEmail[] = [];
  const send = vi.fn(async (message: AccountEmail) => {
    messages.push(message);
  });
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "settings-integration-secret-at-least-32-characters",
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    logger: { disabled: true },
    emailAndPassword: { enabled: true, requireEmailVerification: false },
    ...createAccountSettingsOptions(send, true, "http://localhost:3000"),
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
    email: "old@example.com",
    password: "old-password",
  });
  expect(signup.status).toBe(200);
  const cookie = cookies(signup);
  async function user(activeCookie = cookie) {
    const response = await request("get-session", undefined, activeCookie);
    const data = (await response.json()) as {
      user?: { name: string; email: string; emailVerified: boolean };
    } | null;
    return data?.user;
  }
  async function verifyCurrent() {
    const response = await request("send-verification-email", { email: "old@example.com" }, cookie);
    expect(response.status).toBe(200);
    const message = messages.at(-1)!;
    expect(message.kind).toBe("current");
    expect((await request(message.url)).status).toBe(302);
    expect((await user())?.emailVerified).toBe(true);
  }
  return { request, cookies, cookie, user, messages, send, verifyCurrent };
}

// Real password hashing needs extra time when the complete repository suite runs concurrently.
describe("account settings with real Better Auth", { timeout: 30_000 }, () => {
  it("keeps signup/sign-in unverified and sends no automatic mail", async () => {
    const { request, messages, user } = await setup();
    expect((await user())?.emailVerified).toBe(false);
    expect(
      (await request("sign-in/email", { email: "old@example.com", password: "old-password" }))
        .status,
    ).toBe(200);
    expect(messages).toHaveLength(0);
  });

  it("protects name updates, trims names, and rejects whitespace", async () => {
    const { request, cookie, user } = await setup();
    expect((await request("update-user", { name: "Private" })).status).toBe(401);
    expect((await request("update-user", { name: "  " }, cookie)).status).toBe(400);
    expect((await request("update-user", { name: "  Updated Creator  " }, cookie)).status).toBe(
      200,
    );
    expect((await user())?.name).toBe("Updated Creator");
  });

  it("requires authenticated current-address verification before email changes", async () => {
    const { request, cookie, messages, user } = await setup();
    expect((await request("change-email", { newEmail: "new@example.com" })).status).toBe(401);
    const response = await request("change-email", { newEmail: "new@example.com" }, cookie);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "CURRENT_EMAIL_UNVERIFIED" });
    expect(
      (await request("send-verification-email", { email: "someone@example.com" }, cookie)).status,
    ).toBe(400);
    expect((await request("send-verification-email", { email: "old@example.com" })).status).toBe(
      401,
    );
    expect((await user())?.email).toBe("old@example.com");
    expect(messages).toHaveLength(0);
  });

  it("requires both confirmations and keeps the old sign-in email until completion", async () => {
    const { request, cookie, messages, user, verifyCurrent } = await setup();
    await verifyCurrent();
    expect((await request("change-email", { newEmail: "new@example.com" }, cookie)).status).toBe(
      200,
    );
    const approval = messages.at(-1)!;
    expect(approval).toMatchObject({ kind: "approval", to: "old@example.com" });
    expect((await user())?.email).toBe("old@example.com");
    expect((await request(approval.url)).status).toBe(302);
    const verification = messages.at(-1)!;
    expect(verification).toMatchObject({ kind: "new", to: "new@example.com" });
    expect((await user())?.email).toBe("old@example.com");
    expect((await request(verification.url)).status).toBe(302);
    expect(await user()).toMatchObject({ email: "new@example.com", emailVerified: true });
    expect(
      (await request("sign-in/email", { email: "old@example.com", password: "old-password" }))
        .status,
    ).toBe(401);
    expect(
      (await request("sign-in/email", { email: "new@example.com", password: "old-password" }))
        .status,
    ).toBe(200);
  });

  it("rejects unchanged and duplicate addresses without sending mail", async () => {
    const { request, cookie, messages, verifyCurrent } = await setup();
    await verifyCurrent();
    await request("sign-up/email", {
      name: "Other",
      email: "taken@example.com",
      password: "other-password",
    });
    expect((await request("change-email", { newEmail: " OLD@example.com " }, cookie)).status).toBe(
      400,
    );
    const duplicate = await request("change-email", { newEmail: "taken@example.com" }, cookie);
    expect(duplicate.status).toBe(400);
    expect(await duplicate.json()).toMatchObject({ code: "EMAIL_UNAVAILABLE" });
    expect(messages).toHaveLength(1);
  });

  it("keeps the email unchanged after failed delivery and permits retry", async () => {
    const { request, cookie, user, send, verifyCurrent } = await setup();
    await verifyCurrent();
    send.mockRejectedValueOnce(new Error("delivery failure"));
    expect((await request("change-email", { newEmail: "new@example.com" }, cookie)).status).toBe(
      503,
    );
    expect((await user())?.email).toBe("old@example.com");
    expect((await request("change-email", { newEmail: "new@example.com" }, cookie)).status).toBe(
      200,
    );
  });

  it("rejects expired and invalid links without changing the account", async () => {
    const { request, cookie, messages, user, verifyCurrent } = await setup();
    await verifyCurrent();
    await request("change-email", { newEmail: "new@example.com" }, cookie);
    const approval = messages.at(-1)!;
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 3_601_000);
    const expired = await request(approval.url);
    expect(expired.headers.get("location")).toContain("error=TOKEN_EXPIRED");
    vi.useRealTimers();
    const invalid = new URL(approval.url);
    invalid.searchParams.set("token", "invalid");
    expect((await request(invalid.href)).headers.get("location")).toContain("error=INVALID_TOKEN");
    expect((await user())?.email).toBe("old@example.com");
  });

  it("changes passwords, revokes another session, and keeps the current browser signed in", async () => {
    const { request, cookie, cookies, user } = await setup();
    const other = cookies(
      await request("sign-in/email", { email: "old@example.com", password: "old-password" }),
    );
    expect(
      (
        await request(
          "change-password",
          { currentPassword: "wrong", newPassword: "new-password", revokeOtherSessions: true },
          cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          "change-password",
          { currentPassword: "old-password", newPassword: "short", revokeOtherSessions: true },
          cookie,
        )
      ).status,
    ).toBe(400);
    const changed = await request(
      "change-password",
      { currentPassword: "old-password", newPassword: "new-password", revokeOtherSessions: false },
      cookie,
    );
    expect(changed.status).toBe(200);
    expect(await user(cookies(changed))).toMatchObject({ email: "old@example.com" });
    expect(await user(other)).toBeUndefined();
    expect(
      (await request("sign-in/email", { email: "old@example.com", password: "old-password" }))
        .status,
    ).toBe(401);
    expect(
      (await request("sign-in/email", { email: "old@example.com", password: "new-password" }))
        .status,
    ).toBe(200);
  });
  it("keeps the old email active if second-step delivery fails and allows approval retry", async () => {
    const { request, cookie, user, send, messages, verifyCurrent } = await setup();
    await verifyCurrent();
    await request("change-email", { newEmail: "new@example.com" }, cookie);
    const approval = messages.at(-1)!;
    send.mockRejectedValueOnce(new Error("private-provider-failure"));
    const failure = await request(approval.url);
    expect(failure.status).toBe(503);
    expect(await failure.text()).not.toContain("private-provider-failure");
    expect((await user())?.email).toBe("old@example.com");
    expect((await request(approval.url)).status).toBe(302);
    expect(messages.at(-1)).toMatchObject({ kind: "new", to: "new@example.com" });
  });
});
