import { Module } from "@nestjs/common";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";

@Module({
  controllers: [ConversationsController],
  providers: [ConversationsService, PrismaService, AuditService],
})
export class ConversationsModule {}
