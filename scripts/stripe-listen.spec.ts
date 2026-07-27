import { describe, expect, it, vi } from "vitest";

import {
  redactStripeSecrets,
  resolveStripeCommand,
  runStripeListener,
  type StripeListenerDependencies,
  type StripeListenerOptions,
} from "./stripe-listen";

function createDependencies(
  overrides: Partial<StripeListenerDependencies> = {},
): StripeListenerDependencies & { readonly errors: string[] } {
  const errors: string[] = [];
  let currentTime = 0;

  return {
    checkApiReady: vi.fn().mockResolvedValue(true),
    errors,
    getConfiguredWebhookSecret: vi.fn(() => "whsec_configured"),
    getListenerWebhookSecret: vi.fn().mockResolvedValue("whsec_configured"),
    now: vi.fn(() => currentTime),
    sleep: vi.fn(async (milliseconds: number) => {
      currentTime += milliseconds;
    }),
    startListener: vi.fn().mockResolvedValue(0),
    writeError: vi.fn((message: string) => {
      errors.push(message);
    }),
    ...overrides,
  };
}

const fastOptions: StripeListenerOptions = {
  pollIntervalMs: 1_000,
  readinessTimeoutMs: 2_000,
};

describe("resolveStripeCommand", () => {
  it("runs the underlying npm Stripe shim through Node on Windows without shell mode", async () => {
    const command = await resolveStripeCommand({
      fileExists: (path) => path === "C:\\npm\\node_modules\\@stripe\\cli\\bin\\shim.js",
      findOnPath: vi.fn().mockResolvedValue(["C:\\npm\\stripe.cmd"]),
      nodePath: "C:\\node\\node.exe",
      platform: "win32",
    });

    expect(command).toEqual({
      executable: "C:\\node\\node.exe",
      prefixArguments: ["C:\\npm\\node_modules\\@stripe\\cli\\bin\\shim.js"],
    });
  });
});

describe("redactStripeSecrets", () => {
  it("removes Stripe webhook secrets from listener output", () => {
    expect(
      redactStripeSecrets(
        "Ready! webhook signing secret is whsec_superSecret123; keep whsec_anotherSecret safe.",
      ),
    ).toBe("Ready! webhook signing secret is [REDACTED]; keep [REDACTED] safe.");
  });
});

describe("runStripeListener", () => {
  it("fails before invoking Stripe when the local API never becomes ready", async () => {
    const dependencies = createDependencies({
      checkApiReady: vi.fn().mockResolvedValue(false),
    });

    await expect(runStripeListener(dependencies, fastOptions)).resolves.toBe(1);

    expect(dependencies.getListenerWebhookSecret).not.toHaveBeenCalled();
    expect(dependencies.startListener).not.toHaveBeenCalled();
    expect(dependencies.errors).toEqual([
      "Stripe listener stopped: API did not become ready at http://127.0.0.1:4000/api/v1/health/ready within 2 seconds.",
    ]);
  });

  it("fails safely when Stripe CLI is unavailable or unauthenticated", async () => {
    const dependencies = createDependencies({
      getListenerWebhookSecret: vi
        .fn()
        .mockRejectedValue(new Error("spawn ENOENT whsec_cli_should_not_leak")),
    });

    await expect(runStripeListener(dependencies, fastOptions)).resolves.toBe(1);

    expect(dependencies.startListener).not.toHaveBeenCalled();
    expect(dependencies.errors).toEqual([
      "Stripe listener stopped: Stripe CLI is unavailable or unauthenticated.",
    ]);
    expect(dependencies.errors.join(" ")).not.toContain("whsec_cli_should_not_leak");
  });

  it("refuses forwarding when the Stripe CLI and API signing secrets differ", async () => {
    const dependencies = createDependencies({
      getConfiguredWebhookSecret: vi.fn(() => "whsec_api_should_not_leak"),
      getListenerWebhookSecret: vi.fn().mockResolvedValue("whsec_cli_should_not_leak"),
    });

    await expect(runStripeListener(dependencies, fastOptions)).resolves.toBe(1);

    expect(dependencies.startListener).not.toHaveBeenCalled();
    expect(dependencies.errors).toEqual([
      "Stripe listener stopped: STRIPE_WEBHOOK_SECRET does not match the Stripe CLI listener. Update ignored .env, then restart pnpm dev.",
    ]);
    expect(dependencies.errors.join(" ")).not.toContain("whsec_api_should_not_leak");
    expect(dependencies.errors.join(" ")).not.toContain("whsec_cli_should_not_leak");
  });

  it("starts forwarding after API readiness and signing-secret validation", async () => {
    const startListener = vi.fn().mockResolvedValue(0);
    const dependencies = createDependencies({ startListener });

    await expect(runStripeListener(dependencies, fastOptions)).resolves.toBe(0);

    expect(startListener).toHaveBeenCalledOnce();
    expect(dependencies.errors).toEqual([]);
  });

  it("redacts external command details when listener startup fails", async () => {
    const dependencies = createDependencies({
      getConfiguredWebhookSecret: vi.fn(() => "whsec_config_should_not_leak"),
      getListenerWebhookSecret: vi.fn().mockResolvedValue("whsec_config_should_not_leak"),
      startListener: vi
        .fn()
        .mockRejectedValue(new Error("failed with whsec_listener_should_not_leak")),
    });

    await expect(runStripeListener(dependencies, fastOptions)).resolves.toBe(1);

    expect(dependencies.errors).toEqual([
      "Stripe listener stopped: webhook forwarding could not start.",
    ]);
    expect(dependencies.errors.join(" ")).not.toContain("whsec_config_should_not_leak");
    expect(dependencies.errors.join(" ")).not.toContain("whsec_listener_should_not_leak");
  });
});
