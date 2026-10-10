import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { loadAdminDatabaseConfig } from "@repurposepro/config";
import { closeDatabaseClient, createDatabaseClient, type DatabaseClient } from "@repurposepro/db";

@Injectable()
export class AdminDatabaseService implements OnModuleDestroy {
  private readonly client: DatabaseClient | undefined;
  public constructor() {
    const options = loadAdminDatabaseConfig();
    this.client = options ? createDatabaseClient(options) : undefined;
  }
  public get pool() {
    if (!this.client) throw new Error("Admin data unavailable.");
    return this.client.pool;
  }
  public async onModuleDestroy() {
    if (this.client) await closeDatabaseClient(this.client);
  }
}
