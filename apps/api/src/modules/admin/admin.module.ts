import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminController } from "./admin.controller";
import { AdminDatabaseService } from "./admin-database.service";
import { AdminGuard } from "./admin.guard";
import { AdminService } from "./admin.service";

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminGuard, AdminDatabaseService, AdminService],
})
export class AdminModule {}
