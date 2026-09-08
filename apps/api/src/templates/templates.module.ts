import { Module } from "@nestjs/common";
import { TemplatesController } from "./templates.controller";
import { TemplatesService } from "./templates.service";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";

@Module({
  controllers: [TemplatesController],
  providers: [TemplatesService, PrismaService, AuditService],
})
export class TemplatesModule {}
