import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";

@Module({
  controllers: [BillingController],
  imports: [AuthModule, InfrastructureModule],
  providers: [BillingService],
})
export class BillingModule {}
