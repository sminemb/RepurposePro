import { Injectable, type OnModuleInit } from "@nestjs/common";
import { loadAuthConfig } from "@repurposepro/config";
import { schema } from "@repurposepro/db";

import { DatabaseService } from "../infrastructure/database.service";

@Injectable()
export class AuthService implements OnModuleInit {
  private authInstance: {
    api: {
      getSession: (options: { headers: Headers }) => Promise<{
        user: { email: string; id: string; name: string };
      } | null>;
    };
  } | null = null;

  public constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService;
  }

  private readonly databaseService: DatabaseService;

  public get auth(): NonNullable<AuthService["authInstance"]> {
    if (!this.authInstance) {
      throw new Error("Authentication service is not initialized.");
    }

    return this.authInstance;
  }

  public async onModuleInit(): Promise<void> {
    const config = loadAuthConfig();
    const [{ drizzleAdapter }, { betterAuth }] = await Promise.all([
      import("@better-auth/drizzle-adapter"),
      import("better-auth"),
    ]);

    this.authInstance = betterAuth({
      baseURL: config.url,
      database: drizzleAdapter(this.databaseService.database.db, {
        provider: "pg",
        schema,
        transaction: true,
        usePlural: true,
      }),
      emailAndPassword: {
        enabled: true,
      },
      secret: config.secret,
      trustedOrigins: [...config.trustedOrigins],
    });
  }
}
