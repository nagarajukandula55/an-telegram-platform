import { BadRequestException, Controller, Get, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { createReadStream, existsSync } from "node:fs";
import { resolveAttachmentPath, verifyDownloadToken } from "@an-tg/storage";
import { PrismaService } from "../common/prisma.service";

/**
 * Serves attachment bytes for a signed, time-limited URL (the local-disk
 * equivalent of an S3 presigned GET) — deliberately unauthenticated by
 * session, since connectors fetching an attachment (e.g. the Cloud API
 * pulling a media link) aren't logged-in browser sessions. Trust comes
 * from the HMAC signature + expiry, not a JWT.
 */
@Controller("attachments")
export class AttachmentFilesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("file")
  async serve(@Query("key") key: string, @Query("expires") expires: string, @Query("sig") sig: string, @Res() res: Response) {
    if (!key || !expires || !sig || !verifyDownloadToken(key, Number(expires), sig)) {
      throw new BadRequestException("Invalid or expired download link");
    }

    const absolutePath = resolveAttachmentPath(key);
    if (!existsSync(absolutePath)) {
      throw new BadRequestException("Attachment not found on disk");
    }

    const attachment = await this.prisma.client.attachment.findFirst({ where: { storageLocation: key } });
    res.setHeader("Content-Type", attachment?.mimeType ?? "application/octet-stream");
    if (attachment?.originalName) {
      res.setHeader("Content-Disposition", `inline; filename="${attachment.originalName}"`);
    }
    createReadStream(absolutePath).pipe(res);
  }
}
