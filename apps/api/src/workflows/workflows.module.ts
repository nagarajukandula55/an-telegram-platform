import { Module } from "@nestjs/common";
import { WorkflowsController } from "./workflows.controller";
import { WorkflowsService } from "./workflows.service";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";

@Module({
  controllers: [WorkflowsController],
  providers: [WorkflowsService, PrismaService, AuditService],
})
export class WorkflowsModule {}
