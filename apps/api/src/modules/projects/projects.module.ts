import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import { StorageModule } from "../storage/storage.module";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";
import { UploadFileInterceptor } from "./upload-file.interceptor";

@Module({
  imports: [AuthModule, InfrastructureModule, StorageModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, UploadFileInterceptor],
})
export class ProjectsModule {}
