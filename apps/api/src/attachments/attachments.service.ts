import { BadRequestException, Injectable } from "@nestjs/common";
import { uploadAttachment } from "@an-tg/storage";
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
  constructor(private readonly prisma: PrismaService) {}

  async upload(organizationId: string, file: { buffer: Buffer; originalname: string; mimetype: string; size: number }) {
    // Never trust the client-supplied extension alone — validate the
    // declared MIME type against an allowlist. A real malware-scan hook
    // (spec §70) is still a follow-up; this is allowlist + size only.
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`MIME type "${file.mimetype}" is not allowed`);
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException(`File exceeds maximum size of ${MAX_SIZE_BYTES} bytes`);
    }

    const uploaded = await uploadAttachment({
      buffer: file.buffer,
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
      },
    });
  }

  list(organizationId: string) {
    return this.prisma.client.attachment.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 100 });
  }
}
