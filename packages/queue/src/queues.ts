export const QUEUE_NAMES = {
  SEND: "send",
  CAMPAIGN: "campaign",
  WORKFLOW: "workflow",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface NewSendJobData {
  organizationId: string;
  connectorId: string;
  /** Exactly one of toPhone/toGroupId should be set. */
  toPhone?: string;
  toGroupId?: string;
  contentType: "text" | "image" | "video" | "audio" | "document" | "template";
  body?: string;
  attachmentId?: string;
  idempotencyKey: string;
  campaignId?: string;
  workflowRunId?: string;
  contactId?: string;
}

export interface CampaignJobData {
  campaignId: string;
}

export interface WorkflowJobData {
  workflowRunId: string;
  workflowId: string;
  stepIndex: number;
}
