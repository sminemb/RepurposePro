import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const runRoot = process.env.E2E_RUN_ROOT!;
const appUrl = process.env.E2E_APP_URL!;

test("sign-up requires confirmation and password controls work independently with the keyboard", async ({
  page,
}) => {
  let submitted = false;
  await page.route("**/api/auth/sign-up/email", async (route) => {
    submitted = true;
    await route.abort();
  });
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill("Recovery Creator");
  await page.getByLabel("Email", { exact: true }).fill(`confirmation-${randomUUID()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("RecoveryPassword2026!");
  await page.getByLabel("Confirm password", { exact: true }).fill("different-password");
  const showPassword = page.getByRole("button", { name: "Show password", exact: true });
  await showPassword.focus();
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await expect(page.getByLabel("Confirm password", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  await page.getByRole("button", { name: "Show confirm password", exact: true }).click();
  await expect(page.getByLabel("Confirm password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("passwords do not match");
  expect(submitted).toBe(false);
  await page.goto("/login");
  await page.getByLabel("Password", { exact: true }).fill("RecoveryPassword2026!");
  await page.getByRole("button", { name: "Show password", exact: true }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password", exact: true }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});

test("email recovery resets the password once and signs out every device", async ({
  page,
  browser,
}) => {
  const email = `recovery-${randomUUID()}@example.test`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill("Recovery Creator");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("RecoveryPassword2026!");
  await page.getByLabel("Confirm password", { exact: true }).fill("RecoveryPassword2026!");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const other = await browser.newContext({ baseURL: appUrl });
  const recovery = await browser.newContext({ baseURL: appUrl });
  try {
    await expect(
      await other.request.post("/api/auth/sign-in/email", {
        headers: { Origin: appUrl },
        data: { email, password: "RecoveryPassword2026!" },
      }),
    ).toBeOK();
    const resetPage = await recovery.newPage();
    resetPage.on("pageerror", (error) => errors.push(error.message));
    await resetPage.goto("/forgot-password");
    await resetPage.getByLabel("Email", { exact: true }).fill(email);
    await resetPage.getByRole("button", { name: "Send reset link", exact: true }).click();
    await expect(resetPage.getByRole("status")).toContainText("If an account exists");
    let link = "";
    await expect
      .poll(async () => {
        const data = await readFile(join(runRoot, "account-mail.jsonl"), "utf8").catch(() => "");
        const mail = data
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as { kind: string; to: string; url: string })
          .find((message) => message.kind === "reset" && message.to === email);
        link = mail?.url ?? "";
        return Boolean(link);
      })
      .toBe(true);
    expect(new URL(link).origin).toBe(appUrl);
    await resetPage.goto(link);
    await expect(resetPage.getByLabel("New password", { exact: true })).toBeVisible();
    await resetPage.getByLabel("New password", { exact: true }).fill("UpdatedRecovery2026!");
    await resetPage.getByLabel("Confirm new password", { exact: true }).fill("mismatch");
    await resetPage.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(resetPage.getByRole("main").getByRole("alert")).toContainText("do not match");
    await resetPage.getByRole("button", { name: "Show new password", exact: true }).click();
    await expect(resetPage.getByLabel("New password", { exact: true })).toHaveAttribute(
      "type",
      "text",
    );
    await expect(resetPage.getByLabel("Confirm new password", { exact: true })).toHaveAttribute(
      "type",
      "password",
    );
    await resetPage
      .getByLabel("Confirm new password", { exact: true })
      .fill("UpdatedRecovery2026!");
    await resetPage.getByRole("button", { name: "Reset password", exact: true }).click();
    await expect(resetPage.getByRole("status")).toContainText("All devices have been signed out");
    await expect(resetPage).toHaveURL(`${appUrl}/reset-password`);
    for (const request of [page.request, other.request])
      expect(await (await request.get("/api/auth/get-session")).json()).toBeNull();
    expect(
      (
        await recovery.request.post("/api/auth/sign-in/email", {
          headers: { Origin: appUrl },
          data: { email, password: "RecoveryPassword2026!" },
        })
      ).status(),
    ).toBe(401);
    await resetPage.getByRole("link", { name: "Sign in", exact: true }).click();
    await resetPage.getByLabel("Email", { exact: true }).fill(email);
    await resetPage.getByLabel("Password", { exact: true }).fill("UpdatedRecovery2026!");
    await resetPage.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(resetPage).toHaveURL(/\/dashboard$/);
    await resetPage.goto(link);
    await expect(resetPage.getByRole("main").getByRole("alert")).toContainText("already been used");
    expect(errors).toEqual([]);
  } finally {
    await other.close();
    await recovery.close();
  }
});

test("recovery handles invalid links, rate limits and network failure", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("invalid");
  await page.getByRole("link", { name: "Request a new reset link" }).click();
  await page.getByRole("button", { name: "Send reset link", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("valid email");
  await page.route("**/api/auth/request-password-reset", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ code: "RATE_LIMIT_EXCEEDED" }),
    }),
  );
  await page.getByLabel("Email", { exact: true }).fill("unknown@example.test");
  await page.getByRole("button", { name: "Send reset link", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Wait 10 minutes");
  await page.unroute("**/api/auth/request-password-reset");
  await page.route("**/api/auth/request-password-reset", (route) => route.abort());
  await page.getByRole("button", { name: "Send reset link", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("connection");
});

test("authentication pages fit mobile and desktop screens", async ({ page }) => {
  await mkdir(join(runRoot, "screenshots"), { recursive: true });
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["signup", "forgot-password", "reset-password"]) {
      await page.goto(`/${route}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: join(runRoot, "screenshots", `${route}-${width}.png`),
        fullPage: true,
        animations: "disabled",
        timeout: 15_000,
      });
    }
  }
});
