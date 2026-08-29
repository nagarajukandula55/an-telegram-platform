import { Module } from "@nestjs/common";
import { CampaignsController } from "./campaigns.controller";
import { CampaignsService } from "./campaigns.service";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";

@Module({
  controllers: [CampaignsController],
  providers: [CampaignsService, PrismaService, AuditService],
})
export class CampaignsModule {}
