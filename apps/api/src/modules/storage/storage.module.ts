import { Module } from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";

import { LocalStorageService } from "./local-storage.service";
import { VideoProbeService } from "./video-probe.service";

@Module({
  providers: [
    {
      provide: LocalStorageService,
      useFactory: () => {
        const config = loadApiConfig();
        return new LocalStorageService({ storageRoot: config.storageRoot });
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
