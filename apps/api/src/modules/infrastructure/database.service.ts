import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";
import {
  checkDatabaseConnection,
  closeDatabaseClient,
  createDatabaseClient,
  type DatabaseClient,
} from "@repurposepro/db";

export class DatabaseInitializationError extends Error {
  public constructor(cause: unknown) {
    super("Database initialization failed.", { cause });
    this.name = "DatabaseInitializationError";
  }
}

export class ScopedDatabaseService implements OnModuleInit, OnModuleDestroy {
  protected readonly client: DatabaseClient;

  public constructor(connectionString: string, poolMax: number, ssl: boolean) {
    this.client = createDatabaseClient({ connectionString, poolMax, ssl });
  }

  public async onModuleInit(): Promise<void> {
    try {
      await this.checkConnection();
    } catch (error) {
      throw new DatabaseInitializationError(error);
    }
  }

  public async onModuleDestroy(): Promise<void> {
    await closeDatabaseClient(this.client);
  }

  public async checkConnection(): Promise<void> {
    await checkDatabaseConnection(this.client);
  }

  public get database(): DatabaseClient {
    return this.client;
  }
}

@Injectable()
export class DatabaseService extends ScopedDatabaseService {
  public constructor() {
    const config = loadApiConfig();
    super(config.databaseUrl, config.databasePoolMax, config.databaseSsl);
  }
}
