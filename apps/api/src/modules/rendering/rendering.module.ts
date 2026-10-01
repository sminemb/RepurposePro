import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import { processingDatabaseProvider } from "../processing/scoped-database.provider";
import { RenderingController } from "./rendering.controller";
import { RenderingService } from "./rendering.service";
import { RenderDispatcherService } from "./render-dispatcher.service";

@Module({
  imports: [AuthModule, InfrastructureModule],
  controllers: [RenderingController],
  providers: [RenderingService, RenderDispatcherService, processingDatabaseProvider],
})
export class RenderingModule {}
