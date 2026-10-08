import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";

const runRoot = process.env.E2E_RUN_ROOT!;
const appUrl = process.env.E2E_APP_URL!;
type AccountMail = { kind: string; to: string; url: string };

async function latestMail(to: string, kind: string): Promise<AccountMail> {
  const data = await readFile(join(runRoot, "account-mail.jsonl"), "utf8");
  const mail = data
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as AccountMail)
    .filter((message) => message.to === to && message.kind === kind)
    .at(-1);
  if (!mail) throw new Error("Expected account email was not captured.");
  expect(new URL(mail.url).origin).toBe(appUrl);
  return mail;
}

async function signup(page: Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill("Settings Creator");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("SettingsPassword2026!");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("Settings requires authentication", async ({ page }) => {
  await page.goto("/dashboard/settings");
  await expect(page).toHaveURL(/\/login$/);
});

test("account settings, confirmation emails, sessions, and responsive navigation", async ({
  page,
  browser,
}) => {
  const email = `vs13-${randomUUID()}@example.test`;
  const newEmail = `vs13-new-${randomUUID()}@example.test`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signup(page, email);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Account settings", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("link", { name: "Dashboard", exact: true })).not.toHaveAttribute(
    "aria-current",
    "page",
  );

  const name = page.getByLabel("Account name", { exact: true });
  await name.fill("  ");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.locator("#profile-feedback")).toContainText("Enter your account name");
  await name.fill("  Updated Creator  ");
  await page.route("**/api/auth/update-user", (route) => route.abort());
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.locator("#profile-feedback")).toContainText("Check your connection");
  await expect(name).toHaveValue("  Updated Creator  ");
  await page.unroute("**/api/auth/update-user");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(name).toHaveValue("Updated Creator");
  await expect(page.locator("header").first()).toContainText("Updated Creator");

  await page.getByRole("button", { name: "Verify current email", exact: true }).click();
  await expect(page.locator("#email-feedback")).toContainText("Check your current inbox");
  await page.goto((await latestMail(email, "current")).url);
  await expect(
    page.getByRole("button", { name: "Request email change", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("New email address", { exact: true }).fill(newEmail);
  await page.getByRole("button", { name: "Request email change", exact: true }).click();
  await expect(page.locator("#email-feedback")).toContainText(
    "Check your current inbox to approve",
  );
  await expect(page.getByText(email, { exact: true }).last()).toBeVisible();
  await page.goto((await latestMail(email, "approval")).url);
  await expect(page.getByText(email, { exact: true }).last()).toBeVisible();
  await page.goto((await latestMail(newEmail, "new")).url);
  await expect(page.getByText(newEmail, { exact: true }).last()).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Your verified sign-in email" }),
  ).toBeVisible();

  const other = await browser.newContext({ baseURL: appUrl });
  try {
    await expect(
      await other.request.post("/api/auth/sign-in/email", {
        headers: { Origin: appUrl },
        data: { email: newEmail, password: "SettingsPassword2026!" },
      }),
    ).toBeOK();
    await page.getByLabel("Current password", { exact: true }).fill("wrong-password");
    await page.getByLabel("New password", { exact: true }).fill("UpdatedPassword2026!");
    await page.getByLabel("Confirm new password", { exact: true }).fill("UpdatedPassword2026!");
    await page.getByRole("button", { name: "Change password", exact: true }).click();
    await expect(page.locator("#password-feedback")).toContainText("incorrect");
    await page.getByLabel("Current password", { exact: true }).fill("SettingsPassword2026!");
    await page.getByRole("button", { name: "Change password", exact: true }).click();
    await expect(page.locator("#password-feedback")).toContainText("Other sessions");
    await expect(page.getByLabel("Current password", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("New password", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Confirm new password", { exact: true })).toHaveValue("");
    expect(await (await other.request.get("/api/auth/get-session")).json()).toBeNull();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Account settings", exact: true }),
    ).toBeVisible();
  } finally {
    await other.close();
  }

  await mkdir(join(runRoot, "screenshots"), { recursive: true });
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await name.focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Save name", exact: true })).toBeFocused();
    if (width < 1024) {
      await page.getByRole("button", { name: "Open navigation", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(dialog.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
    await page.screenshot({
      path: join(runRoot, "screenshots", `settings-${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});
