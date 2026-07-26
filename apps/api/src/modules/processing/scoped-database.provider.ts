import type { Provider } from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";

import { ScopedDatabaseService } from "../infrastructure/database.service";

export const PROCESSING_DATABASE = Symbol("PROCESSING_DATABASE");

export const processingDatabaseProvider: Provider = {
  provide: PROCESSING_DATABASE,
  useFactory: () => {
    const config = loadApiConfig();
    return new ScopedDatabaseService(
      config.processingDatabaseUrl,
      config.databasePoolMax,
      config.databaseSsl,
    );
  },
};
