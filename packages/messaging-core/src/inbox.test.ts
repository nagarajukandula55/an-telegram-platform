import { describe, expect, it, vi } from "vitest";
import { ingestInboundMessage } from "./inbox";

function fakePrisma(overrides: { existingContact?: Record<string, unknown>; existingConversation?: Record<string, unknown> } = {}) {
  const contact = overrides.existingContact ?? { id: "contact1", organizationId: "org1", telegramUserId: "999" };
  const conversation = overrides.existingConversation ?? { id: "conv1", organizationId: "org1", contactId: "contact1", status: "open" };

  return {
    contact: {
      findFirst: vi.fn().mockResolvedValue(overrides.existingContact ?? null),
      create: vi.fn().mockResolvedValue(contact),
    },
    conversation: {
      findFirst: vi.fn().mockResolvedValue(overrides.existingConversation ?? null),
      create: vi.fn().mockResolvedValue(conversation),
      update: vi.fn().mockResolvedValue(conversation),
    },
    conversationMessage: {
      create: vi.fn().mockResolvedValue({ id: "msg1", conversationId: conversation.id, direction: "inbound" }),
    },
  } as unknown as import("@an-tg/database").PrismaClient;
}

describe("ingestInboundMessage", () => {
  it("creates a new contact with a synthetic phone when none exists for this telegramUserId", async () => {
    const prisma = fakePrisma();
    await ingestInboundMessage(prisma, { organizationId: "org1", connectorId: "conn1", telegramUserId: "999", body: "hi", raw: {} });

    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: "tg:999", telegramUserId: "999" }) }),
    );
  });

  it("reuses an existing contact instead of creating a duplicate", async () => {
    const prisma = fakePrisma({ existingContact: { id: "contact1", organizationId: "org1", telegramUserId: "999" } });
    await ingestInboundMessage(prisma, { organizationId: "org1", connectorId: "conn1", telegramUserId: "999", body: "hi", raw: {} });

    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it("reuses an existing open conversation instead of creating a new one", async () => {
    const prisma = fakePrisma({
      existingContact: { id: "contact1", organizationId: "org1", telegramUserId: "999" },
      existingConversation: { id: "conv1", organizationId: "org1", contactId: "contact1", status: "open" },
    });
    const result = await ingestInboundMessage(prisma, { organizationId: "org1", connectorId: "conn1", telegramUserId: "999", body: "hi", raw: {} });

    expect(prisma.conversation.create).not.toHaveBeenCalled();
    expect(result.conversation.id).toBe("conv1");
  });

  it("appends an inbound ConversationMessage and bumps lastInboundAt", async () => {
    const prisma = fakePrisma();
    await ingestInboundMessage(prisma, { organizationId: "org1", connectorId: "conn1", telegramUserId: "999", body: "hi", raw: { foo: "bar" } });

    expect(prisma.conversationMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ direction: "inbound", body: "hi" }) }),
    );
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastInboundAt: expect.any(Date) }) }),
    );
  });
});
