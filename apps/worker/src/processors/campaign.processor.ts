import { prisma } from "@an-tg/database";
import { startQueueWorker, enqueue, QUEUE_NAMES, type CampaignJobData, type QueueWorkerHandle } from "@an-tg/queue";
import { renderTemplate } from "@an-tg/messaging-core";

/**
 * Fans a campaign out into one send-queue job per recipient (contacts and
 * groups alike). Rate limiting is left to the send queue's own
 * concurrency/backoff for now — a per-campaign rate policy
 * (messages/minute) is tracked in PLAN.md Phase 3 as still open.
 */
export function startCampaignWorker(): QueueWorkerHandle {
  return startQueueWorker<CampaignJobData>(
    prisma,
    QUEUE_NAMES.CAMPAIGN,
    async (data) => {
      const campaign = await prisma.campaign.findUniqueOrThrow({
        where: { id: data.campaignId },
        include: {
          recipients: { where: { status: "pending" }, include: { contact: true, group: true } },
          template: true,
        },
      });

      if (!campaign.connectorId) {
        throw new Error(`Campaign ${campaign.id} has no connector assigned`);
      }

      await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "RUNNING" } });

      for (const recipient of campaign.recipients) {
        const isGroup = Boolean(recipient.groupId);
        const idempotencyKey = isGroup
          ? `campaign:${campaign.id}:group:${recipient.groupId}`
          : `campaign:${campaign.id}:contact:${recipient.contactId}`;

        // Personalization (spec §6): {{contact.*}} / {{variables.*}} placeholders
        // in the template body are rendered per-recipient before sending —
        // group sends have no `contact`, so only `variables` resolves for them.
        const rawBody = campaign.template?.body ?? "";
        const renderedBody = renderTemplate(rawBody, {
          contact: recipient.contact
            ? {
                name: recipient.contact.name,
                phone: recipient.contact.phone,
                email: recipient.contact.email,
                company: recipient.contact.company,
                language: recipient.contact.language,
                ...(recipient.contact.customFields ? (JSON.parse(recipient.contact.customFields) as Record<string, unknown>) : {}),
              }
            : {},
          variables: recipient.variables ? (JSON.parse(recipient.variables) as Record<string, unknown>) : {},
        });

        await enqueue(prisma, QUEUE_NAMES.SEND, {
          organizationId: campaign.organizationId,
          connectorId: campaign.connectorId,
          toPhone: isGroup ? undefined : recipient.contact?.phone,
          toGroupId: isGroup ? recipient.groupId ?? undefined : undefined,
          contentType: "text",
          body: renderedBody,
          idempotencyKey,
          campaignId: campaign.id,
          contactId: recipient.contactId ?? undefined,
        });
        await prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status: "queued" } });
      }
    },
    { concurrency: 2, pollIntervalMs: 2000 },
  );
}
