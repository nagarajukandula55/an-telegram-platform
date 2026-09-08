import type { PrismaClient, Message } from "@an-tg/database";
import { connectorRegistry, type OutboundMessage, type MessageContentType, type MessageAttachmentRef } from "@an-tg/connectors-core";
import { getSignedDownloadUrl } from "@an-tg/storage";
import { checkSendable } from "./consent";
import { checkRateLimit } from "./rate-limit";
import { classifyError } from "./retry";

export interface SendMessageInput {
  organizationId: string;
  connectorId: string;
  /** Set for a contact send. Exactly one of toPhone/toGroupId must be set. */
  toPhone?: string;
  /** Set for a group/broadcast send — the id of a Group row. */
  toGroupId?: string;
  contentType: MessageContentType;
  body?: string;
  attachmentId?: string;
  idempotencyKey: string;
  campaignId?: string;
  workflowRunId?: string;
  contactId?: string;
}

export interface DeliveryOutcome {
  status: "SENT" | "FAILED";
  errorCode?: string;
  errorCategory?: ReturnType<typeof classifyError>;
  errorMessage?: string;
  providerMessageId?: string;
}

export class SendValidationError extends Error {}

/**
 * Validates and persists a Message row without attempting delivery.
 * Idempotent: calling twice with the same idempotencyKey returns the
 * existing row instead of creating a duplicate. This is the piece the
 * queue-based path (campaign fan-out, workflow send nodes) calls once per
 * logical send; `deliverMessage` is what actually attempts the connector
 * call and is safe to call repeatedly across retries.
 */
export async function createMessageRecord(
  prisma: PrismaClient,
  input: SendMessageInput,
): Promise<{ message: Message; isNew: boolean }> {
  const existing = await prisma.message.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return { message: existing, isNew: false };

  if (!input.toPhone && !input.toGroupId) {
    throw new SendValidationError("Either toPhone or toGroupId is required");
  }
  if (input.toPhone && input.toGroupId) {
    throw new SendValidationError("Only one of toPhone/toGroupId may be set");
  }

  const connector = connectorRegistry.get(input.connectorId);
  const capabilities = await connector.getCapabilities();

  if (input.toGroupId) {
    if (!capabilities.groups) {
      throw new SendValidationError(`Connector "${input.connectorId}" does not support group sending`);
    }
    const group = await prisma.group.findUnique({ where: { id: input.toGroupId } });
    if (!group || group.organizationId !== input.organizationId) {
      throw new SendValidationError(`Group "${input.toGroupId}" not found`);
    }
    // Groups have no consent/opt-out model (spec §27 is contact-scoped) —
    // group membership itself is the consent signal in Telegram's model.
  } else if (input.toPhone) {
    const sendable = await checkSendable(prisma, input.organizationId, input.toPhone);
    if (!sendable.sendable) {
      throw new SendValidationError(sendable.reason ?? "Recipient is not sendable");
    }
  }

  const capabilityKey = (input.contentType === "template" ? "templates" : input.contentType) as keyof typeof capabilities;
  if (!capabilities[capabilityKey]) {
    throw new SendValidationError(`Connector "${input.connectorId}" does not support content type "${input.contentType}"`);
  }

  if (input.attachmentId) {
    const attachment = await prisma.attachment.findUnique({ where: { id: input.attachmentId } });
    if (!attachment || attachment.organizationId !== input.organizationId) {
      throw new SendValidationError(`Attachment "${input.attachmentId}" not found`);
    }
  }

  const message = await prisma.message.create({
    data: {
      organizationId: input.organizationId,
      connectorId: input.connectorId,
      recipientType: input.toGroupId ? "group" : "contact",
      contentType: input.contentType,
      body: input.body,
      recipientPhone: input.toPhone,
      groupId: input.toGroupId,
      idempotencyKey: input.idempotencyKey,
      campaignId: input.campaignId,
      workflowRunId: input.workflowRunId,
      contactId: input.contactId,
      status: "QUEUED",
      ...(input.attachmentId ? { attachments: { create: [{ attachmentId: input.attachmentId }] } } : {}),
    },
  });

  return { message, isNew: true };
}

/**
 * Attempts delivery of an already-persisted Message row and records the
 * outcome. Both the initial send and every later retry attempt call this —
 * it is the only place that touches `connector.send()`.
 */
export async function deliverMessage(prisma: PrismaClient, messageId: string): Promise<DeliveryOutcome> {
  const message = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { attachments: { include: { attachment: true } }, group: true },
  });
  const connector = connectorRegistry.get(message.connectorId);

  const attachmentRefs: MessageAttachmentRef[] = await Promise.all(
    message.attachments.map(async (ma) => ({
      // storageLocation holds the local-disk key; connectors need a
      // fetchable URL, so sign one just-in-time rather than exposing a
      // permanent public link.
      url: await getSignedDownloadUrl(ma.attachment.storageLocation),
      mimeType: ma.attachment.mimeType,
      filename: ma.attachment.originalName,
    })),
  );

  const recipient: OutboundMessage["recipient"] =
    message.recipientType === "group" && message.group
      ? { type: "group", providerGroupId: message.group.providerGroupId ?? message.group.name }
      : { type: "contact", phone: message.recipientPhone ?? undefined };

  const outbound: OutboundMessage = {
    id: message.id,
    idempotencyKey: message.idempotencyKey,
    recipient,
    content: { type: message.contentType as MessageContentType, body: message.body ?? undefined },
    attachments: attachmentRefs.length > 0 ? attachmentRefs : undefined,
    metadata: { organizationId: message.organizationId, campaignId: message.campaignId ?? undefined, workflowRunId: message.workflowRunId ?? undefined },
  };

  const connectorRow = await prisma.connector.findUniqueOrThrow({ where: { id: message.connectorId } });
  const rateLimit = await checkRateLimit(prisma, connectorRow);

  const result = rateLimit.allowed
    ? await connector.send(outbound)
    : {
        accepted: false as const,
        status: "rejected" as const,
        errorCode: "RATE_LIMITED",
        errorMessage: `Connector "${message.connectorId}" is over its per-${rateLimit.window} send limit`,
      };
  const status = result.accepted ? "SENT" : "FAILED";
  const errorCategory = result.accepted ? undefined : classifyError(result.errorCode);

  const updated = await prisma.message.update({
    where: { id: message.id },
    data: {
      status,
      providerMessageId: result.providerMessageId,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    },
  });

  await prisma.messageStatusEvent.create({
    data: { messageId: message.id, status: updated.status, raw: JSON.stringify(result) },
  });

  return { status, errorCode: result.errorCode, errorCategory, errorMessage: result.errorMessage, providerMessageId: result.providerMessageId };
}

/**
 * Convenience wrapper for synchronous single-message sends (the manual
 * composer / API path): create the record, attempt delivery once, return
 * the final row. Queue-driven paths should call `createMessageRecord` +
 * `deliverMessage` separately so retries re-attempt delivery instead of
 * hitting the idempotency short-circuit.
 */
export async function sendOutboundMessage(
  prisma: PrismaClient,
  input: SendMessageInput,
): Promise<Message & { errorCategory?: ReturnType<typeof classifyError> }> {
  const { message, isNew } = await createMessageRecord(prisma, input);
  if (!isNew) return message;

  const outcome = await deliverMessage(prisma, message.id);
  const final = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
  return { ...final, errorCategory: outcome.errorCategory };
}
