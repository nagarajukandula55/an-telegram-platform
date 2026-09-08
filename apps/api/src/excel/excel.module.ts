import { Module } from "@nestjs/common";
import { ExcelController } from "./excel.controller";
import { ExcelService } from "./excel.service";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";

@Module({
  controllers: [ExcelController],
  providers: [ExcelService, PrismaService, AuditService],
})
export class ExcelModule {}
