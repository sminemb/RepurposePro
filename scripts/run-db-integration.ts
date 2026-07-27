import { spawn } from "node:child_process";
import { resolve } from "node:path";

export interface DatabaseIntegrationDependencies {
  readonly restoreDevelopmentRoles: () => Promise<number>;
  readonly runTests: () => Promise<number>;
  readonly writeError: (message: string) => void;
}

export async function runDatabaseIntegrationTests(
  dependencies: DatabaseIntegrationDependencies,
): Promise<number> {
  let testExitCode = 1;
  let testFailure: Error | undefined;

  try {
    testExitCode = await dependencies.runTests();
  } catch (error) {
    testFailure =
      error instanceof Error
        ? error
        : new Error("Database integration test runner failed.", { cause: error });
  }

  const restorationExitCode = await dependencies.restoreDevelopmentRoles();

  if (restorationExitCode !== 0) {
    dependencies.writeError(
      "Database role restoration failed. Run pnpm db:provision-roles before starting the API.",
    );
  }

  if (testFailure !== undefined) {
    throw testFailure;
  }

  return testExitCode !== 0 ? testExitCode : restorationExitCode;
}

function runNodeModule(modulePath: string, arguments_: readonly string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [modulePath, ...arguments_], {
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    });

    child.once("error", () => {
      resolve(1);
    });
    child.once("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}

async function main(): Promise<void> {
  const workspaceRoot = process.cwd();
  const tsxCli = resolve(workspaceRoot, "node_modules/tsx/dist/cli.mjs");
  const vitestCli = resolve(workspaceRoot, "node_modules/vitest/vitest.mjs");
  const roleProvisioner = resolve(workspaceRoot, "packages/db/scripts/provision-database-roles.ts");

  const exitCode = await runDatabaseIntegrationTests({
    restoreDevelopmentRoles: () => runNodeModule(tsxCli, [roleProvisioner]),
    runTests: () =>
      runNodeModule(vitestCli, ["run", "--config", "packages/db/vitest.integration.config.mts"]),
    writeError: (message) => {
      console.error(message);
    },
  });

  process.exitCode = exitCode;
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1]?.replaceAll("\\", "/");
  return entryPath?.endsWith("/scripts/run-db-integration.ts") ?? false;
}

if (isDirectExecution()) {
  void main().catch(() => {
    console.error(
      "Database integration tests stopped unexpectedly. Run pnpm db:provision-roles before starting the API.",
    );
    process.exitCode = 1;
  });
}
