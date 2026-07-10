import { Module } from "@nestjs/common";
import { loadWorkerConfig } from "@repurposepro/config";
import { LoggerModule } from "nestjs-pino";

import { createLoggingConfig } from "./logging.config";
import { WorkerInfrastructureService } from "./services/worker-infrastructure.service";

const config = loadWorkerConfig();

@Module({
  imports: [LoggerModule.forRoot(createLoggingConfig(config))],
  providers: [WorkerInfrastructureService],
})
export class AppModule {}
