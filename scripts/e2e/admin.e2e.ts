import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { createDatabaseClient, closeDatabaseClient } from "@repurposepro/db";

const apiUrl = process.env.E2E_API_URL!;
const operator = "e2e-admin@example.test";
const password = "Admin-test-password-42!";

test("VS14 denies signed-out and non-admin page/API access", async ({ page }) => {
  const signedOut = await page.request.get(`${apiUrl}/admin/overview`);
  expect(signedOut.status()).toBe(401);
  expect(signedOut.headers()["cache-control"]).toContain("no-store");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
  const signIn = await page.request.post("/api/auth/sign-in/email", {
    data: { email: "e2e-non-admin@example.test", password },
  });
  expect(signIn.ok()).toBe(true);
  for (const path of [
    "overview",
    "search?q=someone@example.test",
    "users",
    "users/unknown",
    "projects",
    "projects/unknown",
    "jobs",
    "jobs/unknown",
    "payments",
    "ledger?userId=unknown",
  ]) {
    const response = await page.request.get(`${apiUrl}/admin/${path}`);
    expect(response.status()).toBe(403);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
  }
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
});

test("VS14 operator overview, lookup, histories and responsive navigation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const signIn = await page.request.post("/api/auth/sign-in/email", {
    data: { email: operator, password },
  });
  expect(signIn.ok()).toBe(true);
  const account = (await signIn.json()) as { user: { id: string } };
  const database = createDatabaseClient({
    connectionString: process.env.E2E_OWNER_DATABASE_URL!,
    poolMax: 1,
    ssl: false,
  });
  const projectId = randomUUID();
  const jobId = randomUUID();
  try {
    await database.pool.query(
      "INSERT INTO projects(id,user_id,name,output_type,status) VALUES($1,$2,'SECRET_PROJECT_TITLE','clips','failed')",
      [projectId, account.user.id],
    );
    await database.pool.query(
      "INSERT INTO processing_jobs(id,project_id,user_id,type,status,step,error_code,error_message) VALUES($1,$2,$3,'render_clips','failed','failed','SECRET_ERROR_CODE','SECRET_ERROR_MESSAGE')",
      [jobId, projectId, account.user.id],
    );
    for (let i = 0; i < 23; i++)
      await database.pool.query(
        "INSERT INTO credit_ledger(user_id,type,amount,description,idempotency_key) VALUES($1,'manual_adjustment',1,'SECRET_DESCRIPTION',$2)",
        [account.user.id, `admin-e2e-${i}`],
      );
  } finally {
    await closeDatabaseClient(database);
  }
  const overviewResponse = await page.goto("/admin");
  expect(overviewResponse?.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByRole("heading", { name: "Service overview" })).toBeVisible();
  for (const range of ["7d", "30d", "90d"]) {
    await page.getByLabel("Historical range").selectOption(range);
    await page.getByRole("button", { name: "Apply range" }).click();
    await expect(page).toHaveURL(new RegExp(`range=${range}`));
    await expect(page.getByRole("heading", { name: "Current processing" })).toBeVisible();
  }
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    await page.screenshot({
      path: join(process.env.E2E_RUN_ROOT!, `admin-overview-${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("dialog").getByRole("link", { name: "Admin", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();
  await page.goto("/admin/search");
  await page.getByLabel("Email address or ID").fill(` ${operator.toUpperCase()} `);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("link", { name: account.user.id, exact: true }).click();
  await expect(page.getByRole("heading", { name: "User details" })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("SECRET_");
  await expect(page.getByRole("heading", { name: "Credit ledger" })).toBeVisible();
  const projectsTable = page.getByRole("region", { name: "projects records" });
  await projectsTable.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => projectsTable.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: join(process.env.E2E_RUN_ROOT!, "admin-user-390.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Next page", exact: true }).click();
  await expect(page).toHaveURL(/cursor=/);
  await expect(page.getByRole("link", { name: "First page", exact: true })).toBeVisible();
  await page.goto(`/admin/jobs/${jobId}`);
  await expect(page.locator("main")).toContainText("UNKNOWN_FAILURE");
  await expect(page.locator("main")).not.toContainText("SECRET_");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.goto("/admin/jobs?status=failed");
  await expect(page.getByRole("table")).toContainText(jobId);
  await page.getByRole("link", { name: jobId, exact: true }).click();
  await page.getByRole("link", { name: "Back to list", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/jobs\?status=failed$/);
  await page.getByLabel("Status").selectOption("active");
  await page.getByRole("button", { name: "Apply filter" }).click();
  await expect(page.getByRole("status")).toContainText("No jobs found");
  await page.goto("/admin/search?q=missing-user-id");
  await expect(page.getByText("No users found.")).toBeVisible();
  await page.goto("/admin/users?cursor=invalid");
  await expect(page.locator("main").getByRole("alert")).toContainText("Check your lookup");
  for (const path of [
    "overview",
    "search?q=missing-id",
    "users",
    "projects",
    "jobs",
    "payments",
    "ledger?userId=unknown",
  ]) {
    const response = await page.request.get(`${apiUrl}/admin/${path}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
  }
  expect((await page.request.get(`${apiUrl}/admin/jobs/unknown`)).status()).toBe(404);
  const unavailableDatabase = createDatabaseClient({
    connectionString: process.env.E2E_OWNER_DATABASE_URL!,
    poolMax: 1,
    ssl: false,
  });
  try {
    await unavailableDatabase.pool.query(
      "REVOKE SELECT (id,name,email,created_at,updated_at) ON public.users FROM repurposepro_admin",
    );
    const unavailable = await page.request.get(`${apiUrl}/admin/users`);
    expect(unavailable.status()).toBe(503);
    expect(unavailable.headers()["cache-control"]).toBe("private, no-store");
    expect(await unavailable.text()).not.toContain("permission denied");
    await page.goto("/admin/users");
    await expect(page.locator("main").getByRole("alert")).toContainText("temporarily unavailable");
  } finally {
    await unavailableDatabase.pool.query(
      "GRANT SELECT (id,name,email,created_at,updated_at) ON public.users TO repurposepro_admin",
    );
    await closeDatabaseClient(unavailableDatabase);
  }
  await page.getByRole("link", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  expect(errors).toEqual([]);
});
