import { Module } from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";

import { LocalStorageService } from "./local-storage.service";
import { VideoProbeService } from "./video-probe.service";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import { DatabaseService } from "../infrastructure/database.service";

@Module({
  imports: [InfrastructureModule],
  providers: [
    {
      provide: LocalStorageService,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) => {
        const config = loadApiConfig();
        return new LocalStorageService({
          storageRoot: config.storageRoot,
          registerTemporary: async (userId, projectId, path) => {
            const result = await database.database.pool.query<{ id: string | null }>(
              "SELECT public.register_upload_storage_aux($1,$2,$3,$4) AS id",
              [userId, projectId, path.replaceAll("\\", "/"), config.fileRetentionDays],
            );
            if (!result.rows[0]?.id) throw new Error("Upload staging registration unavailable.");
          },
        });
      },
    },
    {
      provide: VideoProbeService,
      useFactory: () => {
        const config = loadApiConfig();
        return new VideoProbeService({
          ffprobePath: config.ffprobePath,
          fileRetentionDays: config.fileRetentionDays,
          maxDurationSeconds: config.maxVideoDurationSeconds,
        });
      },
    },
  ],
  exports: [LocalStorageService, VideoProbeService],
})
export class StorageModule {}
