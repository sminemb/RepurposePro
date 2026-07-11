import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";
import {
  checkDatabaseConnection,
  closeDatabaseClient,
  createDatabaseClient,
  type DatabaseClient,
} from "@repurposepro/db";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly client: DatabaseClient;

  public constructor() {
    const config = loadApiConfig();
    this.client = createDatabaseClient({
      connectionString: config.databaseUrl,
      poolMax: config.databasePoolMax,
      ssl: config.databaseSsl,
    });
  }

  public async onModuleInit(): Promise<void> {
    await this.checkConnection();
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
