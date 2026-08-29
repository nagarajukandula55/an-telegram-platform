import { Module } from "@nestjs/common";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, PrismaService, AuditService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
