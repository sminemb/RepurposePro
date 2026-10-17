import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { mkdir, copyFile, writeFile, stat } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { createDatabaseClient, closeDatabaseClient } from "@repurposepro/db";

const apiUrl = process.env.E2E_API_URL!;
const runRoot = process.env.E2E_RUN_ROOT!;

async function fixture(page: Page) {
  const session = await page.request.get("/api/auth/get-session");
  let account = (await session.json()) as { user: { id: string } } | null;
  if (!account?.user) {
    const login = await page.request.post("/api/auth/sign-in/email", {
      data: { email: "e2e-non-admin@example.test", password: "Admin-test-password-42!" },
    });
    expect(login.ok()).toBe(true);
    account = (await login.json()) as { user: { id: string } };
  }
  const { user } = account;
  const db = createDatabaseClient({
    connectionString: process.env.E2E_OWNER_DATABASE_URL!,
    poolMax: 2,
    ssl: false,
  });
  const project = randomUUID(),
    video = randomUUID(),
    analysis = randomUUID(),
    transcript = randomUUID(),
    render = randomUUID(),
    output = randomUUID();
  const directory = join(process.env.STORAGE_ROOT!, "users", user.id, "projects", project);
  const source = join(directory, "source");
  const title = `Deletion ${project.slice(0, 8)}`;
  const clips = Array.from({ length: 5 }, (_, i) => ({
    id: randomUUID(),
    title: `Delete clip ${i + 1}`,
  }));
  try {
    await mkdir(source, { recursive: true });
    await copyFile(join(runRoot, "source.mp4"), join(source, "video"));
    const size = (await stat(join(source, "video"))).size;
    await writeFile(
      join(source, "manifest.json"),
      JSON.stringify({
        fileSizeBytes: size,
        mimeType: "video/mp4",
        originalFileName: "source.mp4",
        storedAt: new Date().toISOString(),
        version: 1,
      }),
    );
    await db.pool.query(
      "INSERT INTO projects(id,user_id,name,output_type,status) VALUES($1,$2,$3,'clips','preview_ready')",
      [project, user.id, title],
    );
    await db.pool.query(
      "INSERT INTO uploaded_videos(id,project_id,original_file_name,storage_path,mime_type,file_size_bytes,duration_seconds,width,height,has_audio,expires_at) VALUES($1,$2,'source.mp4',$3,'video/mp4',$4,60,320,180,true,now()+interval '1 day')",
      [video, project, join(source, "video").replaceAll("\\", "/"), size],
    );
    await db.pool.query(
      "INSERT INTO processing_jobs(id,project_id,user_id,type,status) VALUES($1,$2,$3,'analyze_video','completed'),($4,$2,$3,'render_clips','completed')",
      [analysis, project, user.id, render],
    );
    await db.pool.query(
      "UPDATE projects SET current_job_id=$2,current_analysis_job_id=$2 WHERE id=$1",
      [project, analysis],
    );
    await db.pool.query(
      "INSERT INTO transcripts(id,project_id,processing_job_id,uploaded_video_id,language,model,duration_seconds,text) VALUES($1,$2,$3,$4,'en','fixture',60,'Saved caption')",
      [transcript, project, analysis, video],
    );
    for (const [rank, clip] of clips.entries())
      await db.pool.query(
        "INSERT INTO clip_candidates(id,project_id,processing_job_id,transcript_id,kind,rank,title,reason,start_time,end_time,score,caption_lines,caption_position,framing) VALUES($1,$2,$3,$4,'primary',$5,$6,'Fixture',1,8,0.9,$7,$8,NULL)",
        [
          clip.id,
          project,
          analysis,
          transcript,
          rank,
          clip.title,
          JSON.stringify([{ startTime: 1, endTime: 4, text: "Saved caption" }]),
          JSON.stringify({ x: 0.5, y: 0.72 }),
        ],
      );
    const outputPath = join(directory, "renders", render, clips[0]!.id, `${randomUUID()}.mp4`);
    await mkdir(join(outputPath, ".."), { recursive: true });
    const renderResult = spawnSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        join(source, "video"),
        "-t",
        "1",
        "-vf",
        "scale=1080:1920",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-c:a",
        "aac",
        "-y",
        outputPath,
      ],
      { windowsHide: true },
    );
    expect(renderResult.status).toBe(0);
    const outputSize = (await stat(outputPath)).size;
    await db.pool.query(
      "INSERT INTO rendered_outputs(id,project_id,render_job_id,clip_candidate_id,type,title,storage_path,file_name,file_size_bytes,duration_seconds,width,height,video_codec,audio_codec,expires_at) VALUES($1,$2,$3,$4,'clip','Existing export',$5,'clip.mp4',$6,1,1080,1920,'h264','aac',now()+interval '1 day')",
      [output, project, render, clips[0]!.id, outputPath.replaceAll("\\", "/"), outputSize],
    );
    return { project, title, clips, directory, output };
  } finally {
    await closeDatabaseClient(db);
  }
}

test("bulk deletion keeps export selection and downloads; subset, cancel, unsaved changes and all five work", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const f = await fixture(page);
  await page.goto(`/projects/${f.project}/clips`);
  await expect(page.getByRole("heading", { name: "Your clip editor", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Select clips", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Select Delete clip 2 for deletion", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Select Delete clip 3 for deletion", exact: true })
    .check();
  await expect(page.getByText("5 of 5 clips selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete selected (2)", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete 2 clips?", exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByLabel("Start (HH:MM:SS)", { exact: true }).fill("00:00:02");
  await page.getByRole("button", { name: "Delete selected (2)", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Save your changes?" })
    .getByRole("button", { name: "Save & leave", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete 2 clips", exact: true }).click();
  await expect(page.getByText("3 of 3 clips selected", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Delete clip 1", exact: true })).toBeVisible();
  expect(
    (
      await page.request.get(`${apiUrl}/projects/${f.project}/outputs/${f.output}/download`)
    ).status(),
  ).toBe(200);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Select clips", exact: true }).click();
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.getByRole("button", { name: "Clear selection", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Delete selected (0)", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.getByRole("button", { name: "Delete selected (3)", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Delete 3 clips?", exact: true })
    .getByRole("button", { name: "Delete 3 clips", exact: true })
    .click();
  await expect(page.getByText("No clips remain in this preview.", { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByText("No clips remain in this preview.", { exact: false })).toBeVisible();
  expect((await page.request.get(`${apiUrl}/projects/${f.project}/video`)).status()).toBe(200);
  // A fresh five-clip set verifies the one-operation select-all path.
  const all = await fixture(page);
  await page.goto(`/projects/${all.project}/clips`);
  await page.getByRole("button", { name: "Select clips", exact: true }).click();
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.getByRole("button", { name: "Delete selected (5)", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Delete 5 clips?", exact: true })
    .getByRole("button", { name: "Delete 5 clips", exact: true })
    .click();
  await expect(page.getByText("No clips remain in this preview.", { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});

test("project trash is bottom-right, confirms, rejects busy work, then removes files and blocks old URLs", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto("/dashboard");
  const card = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: f.title, exact: true }) });
  const trash = card.getByRole("button", { name: `Delete project ${f.title}`, exact: true });
  const cardBox = (await card.boundingBox())!,
    trashBox = (await trash.boundingBox())!;
  expect(trashBox.x).toBeGreaterThan(cardBox.x + cardBox.width / 2);
  expect(trashBox.y).toBeGreaterThan(cardBox.y + cardBox.height / 2);
  await trash.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Delete this project?", exact: true });
  await expect(dialog).toContainText(f.title);
  await page.keyboard.press("Escape");
  await expect(trash).toBeFocused();
  const db = createDatabaseClient({
    connectionString: process.env.E2E_OWNER_DATABASE_URL!,
    poolMax: 1,
    ssl: false,
  });
  const job = randomUUID();
  try {
    await db.pool.query(
      "INSERT INTO processing_jobs(id,project_id,user_id,type,status) SELECT $1,id,user_id,'render_clips','queued' FROM projects WHERE id=$2",
      [job, f.project],
    );
    await trash.click();
    await dialog.getByRole("button", { name: "Delete project", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Wait for uploads");
    await expect(card).toBeVisible();
    await db.pool.query("UPDATE processing_jobs SET status='completed' WHERE id=$1", [job]);
    await dialog.getByRole("button", { name: "Delete project", exact: true }).click();
    await expect(card).toHaveCount(0);
    await expect
      .poll(
        async () => {
          try {
            await stat(f.directory);
            return false;
          } catch {
            return true;
          }
        },
        { timeout: 30000 },
      )
      .toBe(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: f.title, exact: true })).toHaveCount(0);
    for (const path of ["video", "clips", "outputs", `outputs/${f.output}/download`])
      expect((await page.request.get(`${apiUrl}/projects/${f.project}/${path}`)).status()).toBe(
        404,
      );
    expect((await page.request.delete(`${apiUrl}/projects/${f.project}`)).status()).toBe(204);
    await page.screenshot({
      path: join(runRoot, "project-deletion-dashboard.png"),
      fullPage: true,
    });
  } finally {
    await closeDatabaseClient(db);
  }
});
