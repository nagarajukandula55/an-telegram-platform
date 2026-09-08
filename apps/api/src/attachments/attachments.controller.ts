import { Body, Controller, Get, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AttachmentsService } from "./attachments.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, CurrentUserPayload } from "../common/current-user.decorator";
import { AuditService } from "../common/audit.service";

@UseGuards(JwtAuthGuard)
@Controller("attachments")
export class AttachmentsController {
  constructor(
    private readonly attachments: AttachmentsService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor("file"))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body("watermarkText") watermarkText: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const attachment = await this.attachments.upload(user.organizationId, file, watermarkText);
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: "attachment.uploaded",
      entityType: "Attachment",
      entityId: attachment.id,
      metadata: { mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes },
    });
    return attachment;
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.attachments.list(user.organizationId);
  }
}
