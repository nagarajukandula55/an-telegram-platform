import { Module } from "@nestjs/common";
import { ConnectorLoaderService } from "./connector-loader.service";
import { ConnectorsController } from "./connectors.controller";
import { ConnectorsService } from "./connectors.service";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";

@Module({
  controllers: [ConnectorsController],
  providers: [ConnectorLoaderService, ConnectorsService, PrismaService, AuditService],
  exports: [ConnectorLoaderService],
})
export class ConnectorsModule {}
