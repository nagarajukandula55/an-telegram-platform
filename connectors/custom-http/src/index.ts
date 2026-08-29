import type {
  Connector,
  ConnectorCapabilities,
  HealthStatus,
  OutboundMessage,
  Recipient,
  SendResult,
} from "@an-tg/connectors-core";
import { createHmac } from "node:crypto";

export interface CustomHttpConfig {
  connectorId: string;
  endpointUrl: string;
  healthUrl?: string;
  signingSecret?: string;
  capabilities: ConnectorCapabilities;
  headers?: Record<string, string>;
}

/**
 * Generic outbound connector for customer-owned middleware.
 * POSTs the canonical message envelope (doc section 18) and expects
 * { accepted, providerMessageId, status } back.
 */
export class CustomHttpConnector implements Connector {
  readonly type = "CUSTOM_MIDDLEWARE" as const;
  readonly id: string;

  constructor(private readonly config: CustomHttpConfig) {
    this.id = config.connectorId;
  }

  async getCapabilities(): Promise<ConnectorCapabilities> {
    return this.config.capabilities;
  }

  async validateRecipient(recipient: Recipient): Promise<{ valid: boolean; reason?: string }> {
    if (!recipient.phone && !recipient.providerGroupId) {
      return { valid: false, reason: "Recipient requires phone or providerGroupId" };
    }
    return { valid: true };
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const payload = {
      messageId: message.id,
      idempotencyKey: message.idempotencyKey,
      recipient: message.recipient,
      content: message.content,
      attachments: message.attachments ?? [],
      metadata: message.metadata ?? {},
    };

    const bodyText = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Idempotency-Key": message.idempotencyKey,
      ...this.config.headers,
    };
    if (this.config.signingSecret) {
      headers["X-AN-Signature"] = createHmac("sha256", this.config.signingSecret).update(bodyText).digest("hex");
    }

    try {
      const res = await fetch(this.config.endpointUrl, { method: "POST", headers, body: bodyText });
      const json = (await res.json()) as { accepted?: boolean; providerMessageId?: string; status?: string };

      if (!res.ok || !json.accepted) {
        return { accepted: false, status: "rejected", errorCode: "PROVIDER_REJECTED", errorMessage: `HTTP ${res.status}` };
      }

      return {
        accepted: true,
        status: (json.status as SendResult["status"]) ?? "queued",
        providerMessageId: json.providerMessageId,
      };
    } catch (err) {
      return { accepted: false, status: "failed", errorCode: "TIMEOUT", errorMessage: err instanceof Error ? err.message : "network error" };
    }
  }

  async getStatus(providerMessageId: string): Promise<{ status: string; raw?: unknown }> {
    return { status: "unknown", raw: { providerMessageId } };
  }

  async receiveWebhook(payload: unknown): Promise<void> {
    void payload;
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.config.healthUrl) {
      return { healthy: true, checkedAt: new Date(), detail: "no health endpoint configured" };
    }
    try {
      const res = await fetch(this.config.healthUrl);
      return { healthy: res.ok, checkedAt: new Date() };
    } catch (err) {
      return { healthy: false, checkedAt: new Date(), detail: err instanceof Error ? err.message : "unreachable" };
    }
  }
}
