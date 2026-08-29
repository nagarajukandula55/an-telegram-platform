import { Module } from "@nestjs/common";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentFilesController } from "./attachment-files.controller";
import { AttachmentsService } from "./attachments.service";
import { PrismaService } from "../common/prisma.service";
import { AuditService } from "../common/audit.service";

@Module({
  controllers: [AttachmentsController, AttachmentFilesController],
  providers: [AttachmentsService, PrismaService, AuditService],
})
export class AttachmentsModule {}
