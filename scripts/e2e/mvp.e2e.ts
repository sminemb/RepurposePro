import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { test, expect, type Page, type APIResponse } from "@playwright/test";
import { closeDatabaseClient, createDatabaseClient } from "@repurposepro/db";
import type { ProjectProcessingStatus } from "@repurposepro/shared";

const apiUrl = process.env.E2E_API_URL!;
const runRoot = process.env.E2E_RUN_ROOT!;
const fixtureUrl = process.env.E2E_FIXTURE_URL!;
const browserErrors = new WeakMap<Page, string[]>();
const missingProjects = new WeakMap<Page, string>();
const browserEvidence = new WeakMap<
  Page,
  {
    startedAt: string;
    console: string[];
    http: { url: string; status: number; expected: boolean }[];
  }
>();
const viewports = [
  [375, 812],
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1280, 720],
  [1440, 900],
] as const;

async function responsive(page: Page, route: string, label: string) {
  await page.goto(route);
  await expect(page.getByRole("main")).toBeVisible();
  const headings: Record<string, string> = {
    dashboard: "Your workspace",
    "new-project": "Create a project",
    billing: "Billing",
    upload: "Your source video",
    "clip-editor": "Your clip editor",
    "clip-outputs": "Your exports",
    "summary-outputs": "Your exports",
    "summary-editor": "Your summary editor",
    "processing-active": "Your video is processing",
    "processing-refunded": "Processing stopped",
  };
  if (headings[label])
    await expect(
      page.getByRole("heading", { name: headings[label], exact: true, level: 1 }),
    ).toBeVisible();
  if (label.includes("editor"))
    await expect
      .poll(() =>
        page
          .locator("video")
          .evaluateAll(
            (videos: HTMLVideoElement[]) =>
              videos.length > 0 &&
              videos.every((video) => video.readyState >= 3 && !video.seeking && !video.error),
          ),
      )
      .toBe(true);
  if (label === "upload") {
    await expect(page.getByRole("link", { name: "Open your editor", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Start processing for/ })).toHaveCount(0);
  }
  await mkdir(join(runRoot, "screenshots"), { recursive: true });
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    if (label === "dashboard" && width < 1024) {
      const navigation = page.getByRole("button", { name: "Open navigation", exact: true });
      await navigation.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(navigation).toBeFocused();
    }
    await page.screenshot({
      path: join(runRoot, "screenshots", `${label}-${width}x${height}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function expire(projectId: string, output: boolean) {
  // State fixtures alter only this run's disposable database, never development data.
  const database = createDatabaseClient({
    connectionString: process.env.E2E_OWNER_DATABASE_URL!,
    poolMax: 1,
    ssl: false,
  });
  try {
    await database.pool.query(
      `UPDATE ${output ? "rendered_outputs" : "uploaded_videos"} SET expires_at=clock_timestamp()-interval '1 second' WHERE project_id=$1`,
      [projectId],
    );
  } finally {
    await closeDatabaseClient(database);
  }
}

async function editorBreakpoints(page: Page, summary: boolean) {
  for (const width of [375, 767, 768, 1024, 1279, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    if (summary) {
      await expect(page.getByLabel("Segment 1 start")).toBeVisible();
      await expect(page.getByRole("button", { name: "Save summary", exact: true })).toBeVisible();
    } else if (width < 768) {
      await expect(
        page.getByText(
          "The clip editor works best on a larger screen. Your saved preview is available below.",
        ),
      ).toBeVisible();
      await expect(page.getByLabel("Clip settings", { exact: true })).toBeHidden();
      await expect(page.getByLabel("Choose a clip (2)")).toBeVisible();
    } else {
      await expect(page.getByLabel("Clip settings", { exact: true })).toBeVisible();
      if (width < 1280) {
        await page.getByRole("button", { name: "clips", exact: true }).click();
        await expect(
          page.getByRole("region", { name: "Choose a clip", exact: true }),
        ).toBeVisible();
        await expect(page.getByLabel("Clip settings", { exact: true })).toBeHidden();
        await page.getByRole("button", { name: "settings", exact: true }).click();
      }
    }
  }
  if (!summary) {
    const settings = page.getByLabel("Clip settings", { exact: true });
    expect(await settings.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
      true,
    );
    await page
      .getByRole("textbox", { name: /Caption at/ })
      .first()
      .scrollIntoViewIfNeeded();
    expect(await settings.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  }
}

async function data<T>(response: APIResponse): Promise<T> {
  await expect(response).toBeOK();
  return ((await response.json()) as { data: T }).data;
}
async function balance(page: Page) {
  return (await data<{ balance: number }>(await page.request.get(`${apiUrl}/billing/credits`)))
    .balance;
}

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  const evidence = {
    startedAt: new Date().toISOString(),
    console: [] as string[],
    http: [] as { url: string; status: number; expected: boolean }[],
  };
  browserEvidence.set(page, evidence);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    evidence.console.push(message.text());
    if (!message.text().startsWith("Failed to load resource")) errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const expected =
      (response.status() === 404 &&
        response.request().method() === "GET" &&
        /\/projects\/[a-f0-9-]+\/video$/.test(response.url())) ||
      ([403, 404].includes(response.status()) &&
        response.request().method() === "GET" &&
        !!missingProjects.get(page) &&
        response.url().includes(`/projects/${missingProjects.get(page)}/`));
    evidence.http.push({ url: response.url(), status: response.status(), expected });
    if (!expected) errors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  page.on("requestfailed", (request) => {
    // Route transitions deliberately cancel media, polls and RSC prefetches.
    if (!request.failure()?.errorText.includes("ERR_ABORTED"))
      errors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
  });
});
test.afterEach(async ({ page }) => {
  const evidence = {
    ...browserEvidence.get(page),
    completedAt: new Date().toISOString(),
    errors: browserErrors.get(page),
  };
  await writeFile(
    join(
      runRoot,
      `${test
        .info()
        .title.replace(/[^a-z0-9]+/gi, "-")
        .slice(0, 80)}.json`,
    ),
    JSON.stringify(evidence, null, 2),
  );
  expect(browserErrors.get(page), "unexpected browser errors").toEqual([]);
});

async function signUp(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill("MVP Creator");
  await page.getByLabel("Email", { exact: true }).fill(`vs12-${randomUUID()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("MvpCreatorTest2026!");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function buyCredits(page: Page) {
  await page.route("https://checkout.stripe.com/**", (route) =>
    route.fulfill({
      status: 302,
      headers: {
        location: `${fixtureUrl}/checkout/${new URL(route.request().url()).pathname.split("/").at(-1)}`,
      },
    }),
  );
  await page.goto("/billing");
  await page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "Starter", exact: true }) })
    .getByRole("button", { name: "Buy credits", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Stripe provider fixture" })).toBeVisible();
  const sessionId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.getByRole("button", { name: "Complete test payment" }).click();
  await expect(page).toHaveURL(/\/billing\?checkout=success/);
  await expect.poll(() => balance(page)).toBe(40);
  // Real signature verification and delivery replay must leave exactly one grant.
  await expect(await page.request.post(`${fixtureUrl}/replay/${sessionId}`)).toBeOK();
  await expect.poll(() => balance(page)).toBe(40);
}

async function createAndUpload(page: Page, outputType: "clips" | "summary") {
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill(`VS12 ${outputType}`);
  await page.locator(`input[name="outputType"][value="${outputType}"]`).check({ force: true });
  if (outputType === "summary") {
    // A rejected form action must retain the chosen type before an ordinary retry.
    await page.getByLabel("Project name").fill(" ");
    await page.getByRole("button", { name: "Create project", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator('input[name="outputType"][value="summary"]')).toBeChecked();
    await expect(page.getByLabel("Project name")).toHaveValue(" ");
    await page.getByLabel("Project name").fill("VS12 summary");
  }
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[a-f0-9-]+\/upload$/, { timeout: 90_000 });
  const projectId = page.url().split("/").at(-2)!;
  expect(
    (
      await data<ProjectProcessingStatus>(
        await page.request.get(`${apiUrl}/projects/${projectId}/status`),
      )
    ).outputType,
  ).toBe(outputType);
  await page.locator('input[type="file"]').setInputFiles(join(runRoot, "source.mp4"));
  await page.getByRole("button", { name: "Upload video", exact: true }).click();
  await expect(page.getByText("Upload complete", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start processing for 1 credits", exact: true }),
  ).toBeEnabled();
  return projectId;
}

async function startAnalysis(page: Page, projectId: string, captureProcessing = false) {
  await page.getByRole("button", { name: "Start processing for 1 credits", exact: true }).click();
  await expect(page).toHaveURL(/\/processing$/);
  if (captureProcessing)
    await responsive(page, `/projects/${projectId}/processing`, "processing-active");
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`${apiUrl}/projects/${projectId}/status`);
        return (await data<{ status: string }>(response)).status;
      },
      { timeout: 90_000 },
    )
    .toBe("preview_ready");
  if (captureProcessing)
    expect(
      (
        await data<{ status: string }>(
          await page.request.get(`${apiUrl}/projects/${projectId}/framing-analysis`),
        )
      ).status,
    ).toBe("completed");
  // The processing poller navigates to the editor once the durable preview is ready.
  await expect(page).toHaveURL(/\/(clips|summary)$/);
}

async function ledger(page: Page) {
  const response = await page.request.get(`${apiUrl}/billing/ledger`);
  await expect(response).toBeOK();
  return data<{ type: string; amount: number }[]>(response);
}

async function downloadAndProbe(page: Page, expectedDuration: number, clips: boolean) {
  const button = page.getByRole("link", { name: /Download.*MP4/i }).first();
  await expect(button).toBeVisible({ timeout: 120_000 });
  const downloadEvent = page.waitForEvent("download");
  await button.click();
  const download = await downloadEvent;
  const path = join(runRoot, `${clips ? "clip" : "summary"}-${randomUUID()}.mp4`);
  await download.saveAs(path);
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration,size:stream=codec_type,codec_name,width,height",
      "-of",
      "json",
      path,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  expect(result.status).toBe(0);
  const media = JSON.parse(result.stdout) as {
    format: { duration: string; size: string };
    streams: { codec_type: string; codec_name: string; width?: number; height?: number }[];
  };
  expect(Number(media.format.size)).toBeGreaterThan(0);
  expect(Math.abs(Number(media.format.duration) - expectedDuration)).toBeLessThan(0.25);
  expect(media.streams.find((s) => s.codec_type === "audio")?.codec_name).toBe("aac");
  const video = media.streams.find((s) => s.codec_type === "video")!;
  expect(video.codec_name).toBe("h264");
  expect([video.width, video.height]).toEqual(clips ? [1080, 1920] : [320, 180]);
  const decoded = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-v",
      "error",
      "-i",
      path,
      "-f",
      "null",
      process.platform === "win32" ? "NUL" : "/dev/null",
    ],
    { encoding: "utf8", windowsHide: true },
  );
  expect(decoded.status).toBe(0);
  expect(decoded.stderr).toBe("");
  await writeFile(`${path}.json`, JSON.stringify(media, null, 2));
}

test("fresh account can sign up, buy credits and replay the signed purchase safely", async ({
  page,
}) => {
  await signUp(page);
  await writeFile(join(runRoot, "control.json"), JSON.stringify({ purchaseDelayMs: 1500 }));
  try {
    await buyCredits(page);
    await expect(page.getByRole("cell", { name: "Credit purchase", exact: true })).toBeVisible();
  } finally {
    await writeFile(join(runRoot, "control.json"), JSON.stringify({ failAnalysis: false }));
  }
  const purchases = (await ledger(page)).filter((row) => row.type === "purchase");
  expect(purchases.map((row) => row.amount)).toEqual([40]);
});

test("clips: save trim and captions, select one clip, render and download its saved revision", async ({
  page,
}) => {
  test.setTimeout(360_000);
  await signUp(page);
  await buyCredits(page);
  const projectId = await createAndUpload(page, "clips");
  // Hold the real response briefly to verify accessible loading and empty states.
  const outputsUrl = `${apiUrl}/projects/${projectId}/outputs`;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(outputsUrl, async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto(`/projects/${projectId}/outputs`);
    await expect(page.getByRole("status").filter({ hasText: "Loading exports" })).toBeVisible();
  } finally {
    release();
  }
  await expect(page.getByText(/No rendered outputs yet/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Download MP4", exact: true })).toHaveCount(0);
  await page.unroute(outputsUrl);
  await page.goto(`/projects/${projectId}/upload`);
  // Delay only Gemini's external boundary while real processing progress is inspected.
  await writeFile(join(runRoot, "control.json"), JSON.stringify({ analysisDelayMs: 15_000 }));
  try {
    await startAnalysis(page, projectId, true);
  } finally {
    await writeFile(join(runRoot, "control.json"), JSON.stringify({ failAnalysis: false }));
  }
  await page.getByLabel("Start (seconds)", { exact: true }).fill("0.125");
  await page.getByLabel("End (seconds)", { exact: true }).fill("3.125");
  await page
    .getByRole("textbox", { name: /Caption at/ })
    .first()
    .fill("Saved portfolio caption");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Start (seconds)", { exact: true })).toHaveValue("0.125");
  await expect(page.getByRole("textbox", { name: /Caption at/ }).first()).toHaveValue(
    "Saved portfolio caption",
  );
  await editorBreakpoints(page, false);
  await page.getByLabel("End (seconds)", { exact: true }).fill("3.625");
  await page.getByRole("button", { name: "Conclusion", exact: false }).click();
  await expect(page.getByRole("dialog", { name: "Save your changes?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("End (seconds)", { exact: true })).toHaveValue("3.625");
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  const checkboxes = page
    .getByRole("region", { name: "Choose a clip", exact: true })
    .getByRole("checkbox", { name: /Select .* for export/ });
  await expect(checkboxes).toHaveCount(2);
  await checkboxes.nth(1).click();
  await expect(checkboxes.nth(1)).not.toBeChecked();
  await expect(page.getByText("1 of 2 clips selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Render Selected Clips", exact: true }).click();
  await expect(page).toHaveURL(/\/outputs$/);
  await downloadAndProbe(page, 3, true);
  const outputs = await data<{ clipId: string | null; durationSeconds: number }[]>(
    await page.request.get(`${apiUrl}/projects/${projectId}/outputs`),
  );
  expect(outputs).toHaveLength(1);
  expect(outputs[0]!.clipId).toBeTruthy();
  expect(await balance(page)).toBe(39);
  expect((await ledger(page)).map((row) => [row.type, row.amount]).sort()).toEqual([
    ["processing_deduction", -1],
    ["purchase", 40],
  ]);
  for (const [route, label] of [
    ["/dashboard", "dashboard"],
    ["/projects/new", "new-project"],
    ["/billing", "billing"],
    [`/projects/${projectId}/upload`, "upload"],
    [`/projects/${projectId}/outputs`, "clip-outputs"],
    [`/projects/${projectId}/clips`, "clip-editor"],
  ])
    await responsive(page, route!, label!);
  await expire(projectId, false);
  await page.reload();
  await expect(page.getByText(/The source video is no longer available/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Render Selected Clips", exact: true }),
  ).toBeDisabled();
  await expire(projectId, true);
  await page.goto(`/projects/${projectId}/outputs`);
  await expect(page.getByText("Download unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download MP4", exact: true })).toHaveCount(0);
  const missingProject = randomUUID();
  missingProjects.set(page, missingProject);
  await page.goto(`/projects/${missingProject}/outputs`);
  await expect(
    page.getByRole("alert").filter({ hasText: /temporarily unavailable/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Download MP4", exact: true })).toHaveCount(0);
});

test("summary: chronological playback, trim and removal persist, render saves first and adds no charge", async ({
  page,
}) => {
  test.setTimeout(360_000);
  await signUp(page);
  await buyCredits(page);
  const projectId = await createAndUpload(page, "summary");
  await startAnalysis(page, projectId);
  await expect(page.getByLabel("Segment 1 start")).toHaveValue("1");
  await expect(page.getByLabel("Segment 2 start")).toHaveValue("30");
  await editorBreakpoints(page, true);
  await page.getByRole("button", { name: "Play summary", exact: true }).click();
  await expect
    .poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeGreaterThan(1);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByLabel("Segment 1 start").fill("1.25");
  await page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "Segment 2", exact: true }) })
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await page.getByRole("button", { name: "Save summary", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save summary", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel("Segment 1 start")).toHaveValue("1.25");
  expect(
    await page
      .getByLabel("Segment 1 start")
      .evaluate((input: HTMLInputElement) => input.validity.valid),
  ).toBe(true);
  await expect(page.getByText("Removed segments · 1", { exact: true })).toBeVisible();
  await page.getByLabel("Segment 1 end").fill("4.25");
  await page.getByRole("link", { name: "← Back to workspace", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Save your changes?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Segment 1 end")).toHaveValue("4.25");
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (
      ["PATCH", "POST"].includes(request.method()) &&
      request.url().includes(`/projects/${projectId}/`)
    )
      mutations.push(`${request.method()} ${new URL(request.url()).pathname.split("/").at(-1)}`);
  });
  await page.getByRole("button", { name: "Render Summary", exact: true }).click();
  await expect(page).toHaveURL(/\/outputs$/);
  expect(mutations).toEqual(["PATCH summary", "POST render"]);
  await downloadAndProbe(page, 3, false);
  const summary = await data<{
    revision: number;
    segments: { startTime: number; endTime: number; selected: boolean }[];
  }>(await page.request.get(`${apiUrl}/projects/${projectId}/summary`));
  expect(summary.revision).toBe(2);
  expect(
    summary.segments
      .filter((segment) => segment.selected)
      .map((segment) => [segment.startTime, segment.endTime]),
  ).toEqual([[1.25, 4.25]]);
  expect(await balance(page)).toBe(39);
  expect(
    (await ledger(page))
      .filter((row) => row.type === "processing_deduction")
      .map((row) => row.amount),
  ).toEqual([-1]);
  await responsive(page, `/projects/${projectId}/summary`, "summary-editor");
  await responsive(page, `/projects/${projectId}/outputs`, "summary-outputs");
});

test("analysis failure: exact refund, pending and confirmed feedback, supported retry", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await signUp(page);
  await buyCredits(page);
  const projectId = await createAndUpload(page, "summary");
  await writeFile(join(runRoot, "control.json"), JSON.stringify({ failAnalysis: true }));
  try {
    await page.getByRole("button", { name: "Start processing for 1 credits", exact: true }).click();
    await expect(page).toHaveURL(/\/processing$/);
    await expect
      .poll(
        async () =>
          (
            await data<ProjectProcessingStatus>(
              await page.request.get(`${apiUrl}/projects/${projectId}/status`),
            )
          ).status,
        { timeout: 90_000 },
      )
      .toBe("refunded");
    await expect(page.getByText("1 credits refunded.", { exact: true })).toBeVisible();
    expect(await balance(page)).toBe(40);
    expect((await ledger(page)).map((row) => [row.type, row.amount]).sort()).toEqual([
      ["processing_deduction", -1],
      ["purchase", 40],
      ["refund", 1],
    ]);
    await responsive(page, `/projects/${projectId}/processing`, "processing-refunded");
    const snapshot = await data<ProjectProcessingStatus>(
      await page.request.get(`${apiUrl}/projects/${projectId}/status`),
    );
    // The settlement is real above. This read-only response fixture holds the fleeting pending
    // state long enough to inspect its UI; it does not change a job or credit ledger.
    await page.route(`${apiUrl}/projects/${projectId}/status`, (route) =>
      route.fulfill({
        json: {
          data: {
            ...snapshot,
            status: "failed",
            currentJob: {
              ...snapshot.currentJob,
              status: "failed",
              failure: {
                ...snapshot.currentJob!.failure,
                refundStatus: "pending",
                refundedCredits: 0,
                refundCompletedAt: null,
              },
            },
          },
        },
      }),
    );
    await page.reload();
    await expect(
      page.getByText(
        "Your full analysis refund is pending. This page will update when it settles.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.screenshot({
      path: join(runRoot, "screenshots", "refund-pending.png"),
      fullPage: true,
    });
    await page.unroute(`${apiUrl}/projects/${projectId}/status`);
    await page.reload();
    await expect(page.getByText("1 credits refunded.", { exact: true })).toBeVisible();
  } finally {
    await writeFile(join(runRoot, "control.json"), JSON.stringify({ failAnalysis: false }));
  }
  await page.getByRole("button", { name: "Try analysis again", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirm and use 1 credits", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Confirm and use 1 credits", exact: true }).click();
  await expect(page).toHaveURL(/\/summary$/, { timeout: 90_000 });
  expect(await balance(page)).toBe(39);
});
