import { Module } from "@nestjs/common";
import { GroupsController } from "./groups.controller";
import { GroupsService } from "./groups.service";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";

@Module({
  controllers: [GroupsController],
  providers: [GroupsService, PrismaService, AuditService],
})
export class GroupsModule {}
