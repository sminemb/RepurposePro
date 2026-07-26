import type { Provider } from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";
import type { DatabaseClient } from "@repurposepro/db";

import { ScopedDatabaseService } from "../infrastructure/database.service";

export const CHECKOUT_DATABASE = Symbol("CHECKOUT_DATABASE");
export const WEBHOOK_DATABASE = Symbol("WEBHOOK_DATABASE");

export interface ScopedDatabaseProvider {
  readonly database: DatabaseClient;
}

function scopedDatabaseProvider(
  token: symbol,
  connectionString: (config: ReturnType<typeof loadApiConfig>) => string,
): Provider {
  return {
    provide: token,
    useFactory: () => {
      const config = loadApiConfig();
      return new ScopedDatabaseService(
        connectionString(config),
        config.databasePoolMax,
        config.databaseSsl,
      );
    },
  };
}

export const checkoutDatabaseProvider = scopedDatabaseProvider(
  CHECKOUT_DATABASE,
  (config) => config.checkoutDatabaseUrl,
);
export const webhookDatabaseProvider = scopedDatabaseProvider(
  WEBHOOK_DATABASE,
  (config) => config.webhookDatabaseUrl,
);
