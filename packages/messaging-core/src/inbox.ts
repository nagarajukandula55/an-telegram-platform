import type { PrismaClient } from "@an-tg/database";

export interface InboundMessageInput {
  organizationId: string;
  connectorId: string;
  /** Telegram numeric user id — the only reliable identity a bot gets for whoever messaged it. */
  telegramUserId: string;
  username?: string;
  name?: string;
  body?: string;
  /** Full raw provider payload, stored as-is for later inspection/replay. */
  raw: unknown;
}

/**
 * Phase 8 (Inbox): finds-or-creates the Contact + open Conversation for an
 * inbound message and appends it. Called from both ingestion paths —
 * webhook mode (webhooks.service.ts) and long-polling mode
 * (connectors-bootstrap's onIncomingMessage callback) — so there is one
 * place that decides how an inbound message becomes a Contact/Conversation
 * regardless of which transport delivered it.
 *
 * Contacts have no reliable phone number from the Bot API (only a
 * telegramUserId) — `Contact.phone` is required+unique, so a contact
 * created from an inbound message gets a synthetic `tg:<id>` placeholder
 * phone instead of leaving the field genuinely empty. A real phone number,
 * if it's ever collected another way, simply overwrites this the normal
 * way (contact update), same as it would for a phone contact.
 */
export async function ingestInboundMessage(prisma: PrismaClient, input: InboundMessageInput) {
  let contact = await prisma.contact.findFirst({
    where: { organizationId: input.organizationId, telegramUserId: input.telegramUserId },
  });

  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        organizationId: input.organizationId,
        phone: `tg:${input.telegramUserId}`,
        telegramUserId: input.telegramUserId,
        name: input.name,
        source: "inbound",
      },
    });
  }

  let conversation = await prisma.conversation.findFirst({
    where: { organizationId: input.organizationId, contactId: contact.id, status: { not: "closed" } },
    orderBy: { updatedAt: "desc" },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        organizationId: input.organizationId,
        contactId: contact.id,
        connectorId: input.connectorId,
        status: "open",
      },
    });
  }

  const message = await prisma.conversationMessage.create({
    data: {
      conversationId: conversation.id,
      direction: "inbound",
      body: input.body,
      raw: JSON.stringify(input.raw),
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastInboundAt: new Date(), updatedAt: new Date() },
  });

  return { contact, conversation, message };
}
