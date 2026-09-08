import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { connectorRegistry } from "@an-tg/connectors-core";
import { PrismaService } from "../common/prisma.service";
import { ReplyConversationDto } from "./dto/reply-conversation.dto";

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Team inbox list view — sorted so conversations waiting longest on a reply surface first (spec §8 SLA). */
  list(organizationId: string, status?: string) {
    return this.prisma.client.conversation.findMany({
      where: { organizationId, ...(status ? { status } : {}) },
      include: {
        contact: { select: { id: true, name: true, phone: true, telegramUserId: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: [{ lastInboundAt: "asc" }, { updatedAt: "asc" }],
    });
  }

  async get(organizationId: string, id: string) {
    const conversation = await this.prisma.client.conversation.findUnique({
      where: { id },
      include: {
        contact: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!conversation || conversation.organizationId !== organizationId) {
      throw new NotFoundException("Conversation not found");
    }
    return conversation;
  }

  async assign(organizationId: string, id: string, userId: string | null | undefined) {
    await this.ensureOwned(organizationId, id);
    if (userId) {
      const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
      if (!user || user.organizationId !== organizationId) {
        throw new BadRequestException("User not found in this organization");
      }
    }
    return this.prisma.client.conversation.update({ where: { id }, data: { assignedToId: userId ?? null } });
  }

  async setStatus(organizationId: string, id: string, status: string) {
    await this.ensureOwned(organizationId, id);
    return this.prisma.client.conversation.update({ where: { id }, data: { status } });
  }

  /**
   * Sends a reply directly through the conversation's connector — deliberately
   * not routed through packages/messaging-core's phone-based send pipeline
   * (createMessageRecord/deliverMessage), because a contact who only ever
   * messaged a bot has no real phone number (see inbox.ts's synthetic
   * `tg:<id>` placeholder) — Recipient needs telegramUserId here instead.
   */
  async reply(organizationId: string, id: string, dto: ReplyConversationDto) {
    const conversation = await this.get(organizationId, id);
    if (!conversation.connectorId) {
      throw new BadRequestException("This conversation has no connector to reply through");
    }
    if (!conversation.contact.telegramUserId) {
      throw new BadRequestException("This contact has no known Telegram user id to reply to");
    }

    const connector = connectorRegistry.get(conversation.connectorId);
    const result = await connector.send({
      id: randomUUID(),
      idempotencyKey: `conversation:${conversation.id}:reply:${randomUUID()}`,
      recipient: { type: "contact", telegramUserId: conversation.contact.telegramUserId },
      content: { type: "text", body: dto.body },
    });

    if (!result.accepted) {
      throw new BadRequestException(result.errorMessage ?? "Failed to send reply");
    }

    await this.prisma.client.conversationMessage.create({
      data: { conversationId: conversation.id, direction: "outbound", body: dto.body, raw: JSON.stringify(result) },
    });
    await this.prisma.client.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

    return { sent: true, providerMessageId: result.providerMessageId };
  }

  private async ensureOwned(organizationId: string, id: string): Promise<void> {
    const conversation = await this.prisma.client.conversation.findUnique({ where: { id } });
    if (!conversation || conversation.organizationId !== organizationId) {
      throw new NotFoundException("Conversation not found");
    }
  }
}
