import { Module } from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";

import { LocalStorageService } from "./local-storage.service";

@Module({
  providers: [
    {
      provide: LocalStorageService,
      useFactory: () => {
        const config = loadApiConfig();
        return new LocalStorageService({ storageRoot: config.storageRoot });
      },
    },
  ],
  exports: [LocalStorageService],
})
export class StorageModule {}
