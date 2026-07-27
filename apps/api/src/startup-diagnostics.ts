interface StartupError {
  readonly cause?: unknown;
  readonly code?: unknown;
  readonly name?: unknown;
}

function errorCode(error: unknown): string | null {
  let current = error;

  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current !== "object" || current === null) {
      return null;
    }

    const startupError = current as StartupError;
    if (typeof startupError.code === "string") {
      return startupError.code;
    }

    current = startupError.cause;
  }

  return null;
}

function errorName(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const name = (error as StartupError).name;
  return typeof name === "string" ? name : null;
}

export function describeApiStartupFailure(error: unknown, apiPort: number): string {
  if (errorName(error) === "AuthenticationInitializationError") {
    return "API could not initialize authentication. Verify Better Auth configuration and database schema, then retry.";
  }

  if (errorName(error) === "DatabaseInitializationError") {
    return "API could not initialize PostgreSQL. Verify the local database service, runtime credentials, and migration state, then retry.";
  }

  if (errorName(error) === "RedisInitializationError") {
    return "API could not initialize Redis. Verify the local Redis service and runtime connection settings, then retry.";
  }

  switch (errorCode(error)) {
    case "EADDRINUSE":
      return `API could not start because port ${apiPort} is already in use. Stop the conflicting process or change API_PORT.`;
    case "ECONNREFUSED":
    case "ENOTFOUND":
    case "ETIMEDOUT":
      return "API could not reach a required local service. Start PostgreSQL and Redis, then retry.";
    case "28P01":
      return "API could not authenticate with PostgreSQL. Verify the local runtime database credentials, then retry.";
    default:
      return "API could not start. Check local configuration and required services, then retry.";
  }
}
