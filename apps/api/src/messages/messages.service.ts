import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { sendOutboundMessage, SendValidationError } from "@an-tg/messaging-core";
import { PrismaService } from "../common/prisma.service";
import { SendMessageDto } from "./dto/send-message.dto";

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async send(organizationId: string, dto: SendMessageDto) {
    try {
      return await sendOutboundMessage(this.prisma.client, {
        organizationId,
        connectorId: dto.connectorId,
        toPhone: dto.toPhone,
        toGroupId: dto.toGroupId,
        contentType: dto.contentType,
        body: dto.body,
        attachmentId: dto.attachmentId,
        idempotencyKey: dto.idempotencyKey ?? randomUUID(),
      });
    } catch (err) {
      if (err instanceof SendValidationError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
