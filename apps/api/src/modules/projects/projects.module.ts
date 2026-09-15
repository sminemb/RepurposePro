import { Module } from "@nestjs/common";

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

@Module({
  imports: [AuthModule, InfrastructureModule, StorageModule],
  controllers: [ProjectsController, ClipPreviewsController, ClipEditorController],
  providers: [ProjectsService, ClipPreviewsService, ClipEditorService, UploadFileInterceptor],
})
export class ProjectsModule {}
