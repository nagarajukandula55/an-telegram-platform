import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { applyWatermark, isWatermarkable, scanBuffer, uploadAttachment } from "@an-tg/storage";
import { PrismaService } from "../common/prisma.service";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "video/mp4",
  "audio/mpeg",
  "audio/ogg",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
]);

const MAX_SIZE_BYTES = 16 * 1024 * 1024; // 16MB, generous placeholder — tighten per connector capability at send time

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async upload(
    organizationId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    watermarkText?: string,
  ) {
    // Never trust the client-supplied extension alone — validate the
    // declared MIME type against an allowlist.
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`MIME type "${file.mimetype}" is not allowed`);
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException(`File exceeds maximum size of ${MAX_SIZE_BYTES} bytes`);
    }

    // Malware scan hook (spec §70) — off by default (see packages/storage's
    // scanBuffer doc comment); when a scanner is configured and reports an
    // infection, the upload is rejected outright rather than stored.
    const scan = await scanBuffer(file.buffer);
    if (!scan.clean) {
      this.logger.warn(`Rejected upload "${file.originalname}" for org ${organizationId}: ${scan.detail}`);
      throw new BadRequestException(`File failed malware scan: ${scan.detail}`);
    }

    // Watermarking (spec §70) — opt-in per upload via the `watermarkText`
    // form field; only meaningful for JPEG/PNG (isWatermarkable), silently
    // ignored for every other mime type rather than rejecting the upload.
    let buffer = file.buffer;
    if (watermarkText && isWatermarkable(file.mimetype)) {
      buffer = await applyWatermark(buffer, watermarkText);
    }

    const uploaded = await uploadAttachment({
      buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      organizationId,
    });

    return this.prisma.client.attachment.create({
      data: {
        organizationId,
        originalName: file.originalname,
        storedName: uploaded.storedName,
        mimeType: file.mimetype,
        sizeBytes: uploaded.sizeBytes,
        hash: uploaded.hash,
        storageLocation: uploaded.storedName,
        malwareScanStatus: scan.status,
      },
    });
  }

  list(organizationId: string) {
    return this.prisma.client.attachment.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 100 });
  }
}
