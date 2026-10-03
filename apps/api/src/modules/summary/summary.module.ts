import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import { SummaryController } from "./summary.controller";
import { SummaryService } from "./summary.service";
@Module({
  imports: [AuthModule, InfrastructureModule],
  controllers: [SummaryController],
  providers: [SummaryService],
})
export class SummaryModule {}
