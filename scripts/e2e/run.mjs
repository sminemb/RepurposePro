import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { createWriteStream } from "node:fs";
import { cp, mkdir, readFile, writeFile, symlink, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const runId = randomUUID().replaceAll("-", "");
const runRoot = join(root, "storage/vs12-e2e", runId);
const project = `repurposepro-e2e-${runId}`;
const children = [];
const streams = [];
let composeStarted = false;
let stopping = false;
await mkdir(runRoot, { recursive: true });

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
const [pgPort, redisPort, apiPort, webPort, fixturePort] = await Promise.all(
  Array.from({ length: 5 }, freePort),
);
const appUrl = `http://127.0.0.1:${webPort}`;
const apiUrl = `http://127.0.0.1:${apiPort}/api/v1`;
const env = { ...process.env };
const example = await readFile(join(root, ".env.example"), "utf8");
for (const line of example.split(/\r?\n/)) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line);
  if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
}
const dbUrl = (role, password) =>
  `postgresql://${role}:${password}@127.0.0.1:${pgPort}/repurposepro_e2e`;
Object.assign(env, {
  NODE_ENV: "development",
  APP_ENV: "test",
  APP_URL: appUrl,
  API_URL: apiUrl,
  NEXT_PUBLIC_API_URL: apiUrl,
  API_PORT: String(apiPort),
  BETTER_AUTH_URL: appUrl,
  BETTER_AUTH_TRUSTED_ORIGINS: appUrl,
  BETTER_AUTH_SECRET: "e2e-auth-only-isolated-at-least-thirty-two-characters",
  ARCJET_KEY: "ajkey_e2e_isolated",
  ARCJET_MODE: "DRY_RUN",
  DATABASE_URL: dbUrl("repurposepro_runtime", "e2e-runtime-only"),
  DATABASE_CHECKOUT_URL: dbUrl("repurposepro_checkout", "e2e-checkout-only"),
  DATABASE_WEBHOOK_URL: dbUrl("repurposepro_webhook", "e2e-webhook-only"),
  DATABASE_PROCESSING_URL: dbUrl("repurposepro_processing", "e2e-processing-only"),
  DATABASE_SSL: "false",
  E2E_OWNER_DATABASE_URL: dbUrl("repurposepro_owner", "e2e-owner-only"),
  DATABASE_POOL_MAX: "3",
  REDIS_URL: `redis://:e2e-redis-only@127.0.0.1:${redisPort}`,
  BULLMQ_PREFIX: project,
  STORAGE_ROOT: join(runRoot, "media"),
  GEMINI_API_KEY: "e2e-gemini-only",
  STRIPE_SECRET_KEY: "sk_test_e2eisolatedverification",
  STRIPE_WEBHOOK_SECRET: "whsec_e2eisolatedverification",
  STRIPE_STARTER_PRICE_ID: "price_e2estarter",
  STRIPE_CREATOR_PRICE_ID: "price_e2ecreator",
  STRIPE_PRO_PRICE_ID: "price_e2epro",
  STRIPE_SUCCESS_URL: `${appUrl}/billing?checkout=success`,
  STRIPE_CANCEL_URL: `${appUrl}/billing?checkout=cancelled`,
  FACE_PYTHON_PATH: resolve(
    root,
    process.env.E2E_FACE_PYTHON_PATH ??
      (process.platform === "win32"
        ? ".venv/framing/Scripts/python.exe"
        : ".venv/framing/bin/python"),
  ),
  WHISPER_PYTHON_PATH: join(
    root,
    process.platform === "win32" ? ".venv/whisper/Scripts/python.exe" : ".venv/whisper/bin/python",
  ),
  FACE_MODEL_PATH: join(root, "storage/models/blaze_face_short_range.tflite"),
  FFMPEG_PATH: "ffmpeg",
  FFPROBE_PATH: "ffprobe",
  FFMPEG_PRESET: "ultrafast",
  LOG_LEVEL: "warn",
  LOG_PRETTY: "false",
  E2E_RUN_ROOT: runRoot,
  E2E_POSTGRES_PORT: String(pgPort),
  E2E_REDIS_PORT: String(redisPort),
  E2E_FIXTURE_PORT: String(fixturePort),
  E2E_APP_URL: appUrl,
  E2E_API_URL: apiUrl,
  E2E_FIXTURE_URL: `http://127.0.0.1:${fixturePort}`,
});
const composeArgs = ["compose", "-p", project, "-f", join(root, "infra/e2e.compose.yaml")];
function start(command, args, label, options = {}) {
  const log = createWriteStream(join(runRoot, `${label}.log`));
  streams.push(log);
  const child = spawn(command, args, {
    cwd: root,
    env,
    shell: false,
    windowsHide: true,
    ...options,
  });
  children.push(child);
  child.stdout?.pipe(log);
  child.stderr?.pipe(log);
  child.on("error", (error) => log.write(`${error.message}\n`));
  return child;
}
async function command(commandName, args, label, options) {
  const child = start(commandName, args, label, options);
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (code !== 0)
    throw new Error(`${label} failed (${code}); see ${join(runRoot, `${label}.log`)}`);
}
async function waitFor(url, process, timeout = 180_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (process.exitCode !== null) throw new Error(`Service exited before readiness: ${url}`);
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(3000) })).ok) return;
    } catch {
      /* booting */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Readiness timed out: ${url}`);
}
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children.filter((child) => child.exitCode === null)) {
    if (process.platform === "win32") {
      await new Promise((resolve) => {
        const kill = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
        kill.once("exit", resolve);
        kill.once("error", resolve);
      });
    } else child.kill("SIGTERM");
  }
  // Only this invocation's unique Compose project is removed. Development volumes are untouched.
  if (composeStarted)
    await command("docker", [...composeArgs, "down", "--volumes", "--remove-orphans"], "teardown");
  streams.forEach((stream) => stream.end());
}
process.once("SIGINT", () => {
  void stop().finally(() => process.exit(130));
});
process.once("SIGTERM", () => {
  void stop().finally(() => process.exit(143));
});

try {
  // Build packages/apps first when invoked independently; ci:check already did this.
  await access(env.FACE_PYTHON_PATH).catch(() => {
    throw new Error("Set up the pinned framing Python environment or set E2E_FACE_PYTHON_PATH.");
  });
  await access(env.FACE_MODEL_PATH).catch(() => {
    throw new Error("Set up the verified framing model with scripts/setup-framing.py.");
  });
  if (!process.argv.includes("--built")) {
    await command(
      process.execPath,
      [join(root, "node_modules/typescript/bin/tsc"), "-p", "packages/shared/tsconfig.json"],
      "build-shared",
    );
    await command(
      process.execPath,
      [join(root, "node_modules/typescript/bin/tsc"), "-p", "packages/config/tsconfig.json"],
      "build-config",
    );
    await command(
      process.execPath,
      [join(root, "node_modules/typescript/bin/tsc"), "-p", "packages/db/tsconfig.json"],
      "build-db",
    );
    for (const app of ["api", "worker"]) {
      await command(
        process.execPath,
        [join(root, "node_modules/typescript/bin/tsc"), "-p", `apps/${app}/tsconfig.json`],
        `build-${app}`,
      );
    }
  }
  await writeFile(join(runRoot, "control.json"), JSON.stringify({ failAnalysis: false }));
  await command(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=15",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000",
      "-t",
      "60",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-y",
      join(runRoot, "source.mp4"),
    ],
    "fixture-media",
  );
  composeStarted = true;
  await command(
    "docker",
    [...composeArgs, "up", "-d", "--wait", "--wait-timeout", "90"],
    "infrastructure",
  );
  // Import after the optional builds so a fresh checkout needs no existing dist files.
  const { createDatabaseClient, migrateDatabaseForTests, closeDatabaseClient } =
    await import("@repurposepro/db");
  const database = createDatabaseClient({
    connectionString: dbUrl("repurposepro_owner", "e2e-owner-only"),
    poolMax: 2,
    ssl: false,
  });
  try {
    await migrateDatabaseForTests(database, join(root, "packages/db/drizzle"));
  } finally {
    await closeDatabaseClient(database);
  }
  const stagedWeb = join(runRoot, "web");
  await cp(join(root, "apps/web"), stagedWeb, {
    recursive: true,
    filter: (path) => !/[\\/](node_modules|\.next|\.env[^\\/]*)($|[\\/])/.test(path),
  });
  await symlink(
    join(root, "apps/web/node_modules"),
    join(stagedWeb, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const tsconfig = JSON.parse(await readFile(join(stagedWeb, "tsconfig.json"), "utf8"));
  tsconfig.extends = join(root, "tsconfig.base.json").replaceAll("\\", "/");
  await writeFile(join(stagedWeb, "tsconfig.json"), JSON.stringify(tsconfig));
  // Write the alias ONLY into the disposable copy. The source Next config is untouched.
  await writeFile(
    join(stagedWeb, "next.config.ts"),
    `import type { NextConfig } from "next"; const config: NextConfig = { transpilePackages: ["@repurposepro/config", "@repurposepro/shared"], webpack(config) { config.resolve.alias["@arcjet/next"] = ${JSON.stringify(join(root, "scripts/e2e/arcjet-fixture.mjs"))}; return config; } }; export default config;`,
  );
  const api = start(process.execPath, [join(root, "scripts/e2e/server.cjs"), "api"], "api");
  await waitFor(`${apiUrl}/health/ready`, api);
  await waitFor(`${env.E2E_FIXTURE_URL}/ready`, api);
  const worker = start(
    process.execPath,
    [join(root, "scripts/e2e/server.cjs"), "worker"],
    "worker",
  );
  const until = Date.now() + 60_000;
  for (;;) {
    try {
      await access(join(runRoot, "worker-ready"));
      break;
    } catch {
      /* booting */
    }
    if (Date.now() > until || worker.exitCode !== null) throw new Error("Worker failed readiness.");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const nextCli = join(root, "apps/web/node_modules/next/dist/bin/next");
  const productionEnv = { ...env, NODE_ENV: "production", ARCJET_MODE: "LIVE" };
  await command(process.execPath, [nextCli, "build", stagedWeb, "--webpack"], "build-web", {
    env: productionEnv,
  });
  const web = start(
    process.execPath,
    [nextCli, "start", stagedWeb, "--hostname", "127.0.0.1", "--port", String(webPort)],
    "web",
    { env: productionEnv },
  );
  await waitFor(`${appUrl}/login`, web);
  console.log(`E2E stack ready. Evidence: ${runRoot}`);
  const test = spawn(
    process.execPath,
    [
      join(root, "node_modules/@playwright/test/cli.js"),
      "test",
      "--config",
      join(root, "scripts/e2e/playwright.config.ts"),
      ...process.argv.slice(2).filter((arg) => arg !== "--built"),
    ],
    { cwd: root, env, stdio: "inherit", windowsHide: true },
  );
  children.push(test);
  const code = await new Promise((resolve, reject) => {
    test.once("error", reject);
    test.once("exit", resolve);
  });
  process.exitCode = code ?? 1;
} catch (error) {
  console.error(error.message);
  console.error(`E2E evidence: ${runRoot}`);
  if (composeStarted) {
    await command(
      "docker",
      [...composeArgs, "logs", "--no-color"],
      "infrastructure-diagnostics",
    ).catch(() => {});
  }
  process.exitCode = 1;
} finally {
  await stop().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
