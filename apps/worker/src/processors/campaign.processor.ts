import { prisma } from "@an-tg/database";
import { startQueueWorker, enqueue, QUEUE_NAMES, type CampaignJobData, type QueueWorkerHandle } from "@an-tg/queue";

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

        // TODO(Phase 6/9 personalization engine): render campaign.template.body
        // against recipient.variables / contact fields instead of sending raw body.
        await enqueue(prisma, QUEUE_NAMES.SEND, {
          organizationId: campaign.organizationId,
          connectorId: campaign.connectorId,
          toPhone: isGroup ? undefined : recipient.contact?.phone,
          toGroupId: isGroup ? recipient.groupId ?? undefined : undefined,
          contentType: "text",
          body: campaign.template?.body ?? "",
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
