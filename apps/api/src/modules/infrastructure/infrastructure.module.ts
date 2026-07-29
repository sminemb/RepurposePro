import { Module } from "@nestjs/common";

import { DatabaseService } from "./database.service";
import { BullMqConnectionFactory } from "./bullmq-connection.factory";
import { RedisService } from "./redis.service";

@Module({
  providers: [BullMqConnectionFactory, DatabaseService, RedisService],
  exports: [BullMqConnectionFactory, DatabaseService, RedisService],
})
export class InfrastructureModule {}
