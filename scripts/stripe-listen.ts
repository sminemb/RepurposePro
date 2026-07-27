import { execFile, spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

import { loadApiConfig } from "@repurposepro/config";

const execFileAsync = promisify(execFile);
const readinessUrl = "http://127.0.0.1:4000/api/v1/health/ready";
const webhookUrl = "http://127.0.0.1:4000/api/v1/billing/webhook";
const stripeEvents = "checkout.session.completed,checkout.session.expired";

export interface StripeListenerDependencies {
  readonly checkApiReady: () => Promise<boolean>;
  readonly getConfiguredWebhookSecret: () => string;
  readonly getListenerWebhookSecret: () => Promise<string>;
  readonly now: () => number;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly startListener: () => Promise<number>;
  readonly writeError: (message: string) => void;
}

export interface StripeListenerOptions {
  readonly pollIntervalMs: number;
  readonly readinessTimeoutMs: number;
}

export interface StripeCommand {
  readonly executable: string;
  readonly prefixArguments: readonly string[];
}

export interface StripeCommandResolutionDependencies {
  readonly fileExists: (path: string) => boolean;
  readonly findOnPath: () => Promise<readonly string[]>;
  readonly nodePath: string;
  readonly platform: NodeJS.Platform;
}

const defaultOptions: StripeListenerOptions = {
  pollIntervalMs: 1_000,
  readinessTimeoutMs: 120_000,
};

export async function resolveStripeCommand(
  dependencies: StripeCommandResolutionDependencies,
): Promise<StripeCommand> {
  if (dependencies.platform !== "win32") {
    return { executable: "stripe", prefixArguments: [] };
  }

  const candidates = await dependencies.findOnPath();

  for (const candidate of candidates) {
    const extension = extname(candidate).toLowerCase();

    if (extension === ".exe") {
      return { executable: candidate, prefixArguments: [] };
    }

    if (extension === ".cmd" || extension === ".ps1") {
      const shimPath = join(dirname(candidate), "node_modules", "@stripe", "cli", "bin", "shim.js");

      if (dependencies.fileExists(shimPath)) {
        return {
          executable: dependencies.nodePath,
          prefixArguments: [shimPath],
        };
      }
    }
  }

  throw new Error("Stripe CLI executable was not found.");
}

export function redactStripeSecrets(value: string): string {
  return value.replace(/whsec_[A-Za-z0-9]+/gu, "[REDACTED]");
}

export async function runStripeListener(
  dependencies: StripeListenerDependencies = createDefaultDependencies(),
  options: StripeListenerOptions = defaultOptions,
): Promise<number> {
  const apiReady = await waitForApi(dependencies, options);

  if (!apiReady) {
    dependencies.writeError(
      `Stripe listener stopped: API did not become ready at ${readinessUrl} within ${options.readinessTimeoutMs / 1_000} seconds.`,
    );
    return 1;
  }

  let configuredSecret: string;
  let listenerSecret: string;

  try {
    configuredSecret = dependencies.getConfiguredWebhookSecret();
  } catch {
    dependencies.writeError(
      "Stripe listener stopped: API configuration is unavailable. Check ignored .env, then restart pnpm dev.",
    );
    return 1;
  }

  try {
    listenerSecret = await dependencies.getListenerWebhookSecret();
  } catch {
    dependencies.writeError(
      "Stripe listener stopped: Stripe CLI is unavailable or unauthenticated.",
    );
    return 1;
  }

  if (!secretsMatch(configuredSecret, listenerSecret)) {
    dependencies.writeError(
      "Stripe listener stopped: STRIPE_WEBHOOK_SECRET does not match the Stripe CLI listener. Update ignored .env, then restart pnpm dev.",
    );
    return 1;
  }

  try {
    return await dependencies.startListener();
  } catch {
    dependencies.writeError("Stripe listener stopped: webhook forwarding could not start.");
    return 1;
  }
}

async function waitForApi(
  dependencies: StripeListenerDependencies,
  options: StripeListenerOptions,
): Promise<boolean> {
  const deadline = dependencies.now() + options.readinessTimeoutMs;

  while (true) {
    try {
      if (await dependencies.checkApiReady()) {
        return true;
      }
    } catch {
      // Startup races are expected while the API builds and opens its port.
    }

    const remainingMs = deadline - dependencies.now();
    if (remainingMs <= 0) {
      return false;
    }

    await dependencies.sleep(Math.min(options.pollIntervalMs, remainingMs));
  }
}

function secretsMatch(configuredSecret: string, listenerSecret: string): boolean {
  const configured = Buffer.from(configuredSecret);
  const listener = Buffer.from(listenerSecret);

  return configured.length === listener.length && timingSafeEqual(configured, listener);
}

function createDefaultDependencies(): StripeListenerDependencies {
  let stripeCommandPromise: Promise<StripeCommand> | undefined;
  const getStripeCommand = () => {
    stripeCommandPromise ??= resolveStripeCommand({
      fileExists: existsSync,
      findOnPath: async () => {
        const { stdout } = await execFileAsync("where.exe", ["stripe"], {
          encoding: "utf8",
          windowsHide: true,
        });
        return stdout
          .split(/\r?\n/u)
          .map((path) => path.trim())
          .filter((path) => path.length > 0);
      },
      nodePath: process.execPath,
      platform: process.platform,
    });
    return stripeCommandPromise;
  };

  return {
    checkApiReady: async () => {
      const response = await fetch(readinessUrl, {
        signal: AbortSignal.timeout(2_000),
      });
      return response.ok;
    },
    getConfiguredWebhookSecret: () => loadApiConfig().stripe.webhookSecret,
    getListenerWebhookSecret: async () => {
      const command = await getStripeCommand();
      const { stdout } = await execFileAsync(
        command.executable,
        [...command.prefixArguments, "listen", `--events=${stripeEvents}`, "--print-secret"],
        {
          encoding: "utf8",
          windowsHide: true,
        },
      );
      return stdout.trim();
    },
    now: Date.now,
    sleep: (milliseconds) =>
      new Promise((resolveSleep) => {
        setTimeout(resolveSleep, milliseconds);
      }),
    startListener: async () => startListenerProcess(await getStripeCommand()),
    writeError: (message) => {
      console.error(message);
    },
  };
}

async function startListenerProcess(command: StripeCommand): Promise<number> {
  const child = spawn(
    command.executable,
    [...command.prefixArguments, "listen", `--events=${stripeEvents}`, "--forward-to", webhookUrl],
    {
      shell: false,
      stdio: ["inherit", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  const outputLines = child.stdout
    ? createInterface({ input: child.stdout, terminal: false })
    : undefined;
  const errorLines = child.stderr
    ? createInterface({ input: child.stderr, terminal: false })
    : undefined;

  outputLines?.on("line", (line) => {
    process.stdout.write(`${redactStripeSecrets(line)}\n`);
  });
  errorLines?.on("line", (line) => {
    process.stderr.write(`${redactStripeSecrets(line)}\n`);
  });

  return new Promise<number>((resolveExit, rejectExit) => {
    const forwardSignal = (signal: NodeJS.Signals) => {
      if (!child.killed) {
        child.kill(signal);
      }
    };
    const forwardInterrupt = () => {
      forwardSignal("SIGINT");
    };
    const forwardTermination = () => {
      forwardSignal("SIGTERM");
    };
    const cleanup = () => {
      outputLines?.close();
      errorLines?.close();
      process.off("SIGINT", forwardInterrupt);
      process.off("SIGTERM", forwardTermination);
    };

    process.once("SIGINT", forwardInterrupt);
    process.once("SIGTERM", forwardTermination);
    child.once("error", (error) => {
      cleanup();
      rejectExit(error);
    });
    child.once("close", (code) => {
      cleanup();
      resolveExit(code ?? 1);
    });
  });
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1]?.replaceAll("\\", "/");
  return entryPath?.endsWith("/scripts/stripe-listen.ts") ?? false;
}

if (isDirectExecution()) {
  void runStripeListener().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    () => {
      console.error("Stripe listener stopped: unexpected startup failure.");
      process.exitCode = 1;
    },
  );
}
