import { FramingController } from "./framing.controller";
import { Module } from "@nestjs/common";
import { UploadOwnershipGuard } from "./upload-ownership.guard";

import { AuthModule } from "../auth/auth.module";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import { StorageModule } from "../storage/storage.module";
import { ClipPreviewsController } from "./clip-previews.controller";
import { ClipEditorController } from "./clip-editor.controller";
import { ClipEditorService } from "./clip-editor.service";
import { ClipPreviewsService } from "./clip-previews.service";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";
import { UploadFileInterceptor } from "./upload-file.interceptor";
import { DeletionController } from "./deletion.controller";
import { DeletionService } from "./deletion.service";

@Module({
  imports: [AuthModule, InfrastructureModule, StorageModule],
  controllers: [
    DeletionController,
    FramingController,
    ProjectsController,
    ClipPreviewsController,
    ClipEditorController,
  ],
  providers: [
    DeletionService,
    ProjectsService,
    ClipPreviewsService,
    ClipEditorService,
    UploadFileInterceptor,
    UploadOwnershipGuard,
  ],
})
export class ProjectsModule {}
