import { Injectable, Logger, BadRequestException, NotFoundException } from "@nestjs/common";
import { randomUUID, randomBytes } from "node:crypto";
import { loadConnectorsFromDb } from "@an-tg/connectors-bootstrap";
import { encryptSecret } from "@an-tg/connectors-core";
import { MtprotoLoginSession } from "@an-tg/connector-telegram-mtproto";
import type { Connector } from "@an-tg/database";
import { PrismaService } from "../common/prisma.service";
import { CreateConnectorDto } from "./dto/create-connector.dto";
import type { StartMtprotoLoginDto } from "./dto/mtproto-login.dto";

/**
 * Connector rows store capabilities/config as JSON strings (SQLite has no
 * Json column type) — parse for API responses. `webhookSecret` is
 * deliberately redacted here (replaced with a boolean) since this is what
 * every list/create/update caller in this file returns — reveal it only via
 * the dedicated `getWebhookSecret` endpoint, gated the same as connector
 * creation.
 */
function present(row: Connector) {
  return {
    ...row,
    capabilities: JSON.parse(row.capabilities) as Record<string, boolean>,
    config: row.config ? (JSON.parse(row.config) as Record<string, unknown>) : null,
    webhookSecret: undefined,
    hasWebhookSecret: Boolean(row.webhookSecret),
  };
}

/**
 * In-memory registry of in-progress MTProto login attempts (phone -> code ->
 * optional 2FA password). Deliberately not persisted: each attempt holds a
 * live MTProto TCP connection and completes in seconds to minutes, and
 * restarting the API process mid-login is an acceptable "start over" case.
 */
interface PendingLogin {
  session: MtprotoLoginSession;
  apiId: number;
  apiHash: string;
  organizationId: string;
  createdAt: number;
}

const LOGIN_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class ConnectorsService {
  private readonly logger = new Logger(ConnectorsService.name);
  private readonly pendingLogins = new Map<string, PendingLogin>();

  constructor(private readonly prisma: PrismaService) {}

  // -- MTProto interactive login flow -----------------------------------
  // phone -> sendCode() -> submitCode() -> (maybe) submitPassword() -> finalize()
  // See connectors/connector-telegram-mtproto/src/login.ts for the GramJS
  // mechanics this wraps. The resulting session string is encrypted with
  // encryptSecret() before ever touching the database.

  async startMtprotoLogin(organizationId: string, dto: StartMtprotoLoginDto) {
    this.evictExpiredLogins();
    const session = new MtprotoLoginSession(dto.apiId, dto.apiHash);
    const { phoneCodeHash } = await session.sendCode(dto.phoneNumber);
    const loginAttemptId = randomUUID();
    this.pendingLogins.set(loginAttemptId, {
      session,
      apiId: dto.apiId,
      apiHash: dto.apiHash,
      organizationId,
      createdAt: Date.now(),
    });
    return { loginAttemptId, phoneCodeHash };
  }

  async submitMtprotoCode(organizationId: string, loginAttemptId: string, code: string) {
    const pending = this.getPending(organizationId, loginAttemptId);
    const result = await pending.session.submitCode(code);
    if (result.status === "needs_password") {
      return { status: "needs_password" as const };
    }
    return { status: "ready_to_finalize" as const, sessionString: result.sessionString };
  }

  async submitMtprotoPassword(organizationId: string, loginAttemptId: string, password: string) {
    const pending = this.getPending(organizationId, loginAttemptId);
    const result = await pending.session.submitPassword(password);
    return { status: "ready_to_finalize" as const, sessionString: result.sessionString };
  }

  /** Persists the logged-in session as an active Connector row and drops the pending-login state. */
  async finalizeMtprotoConnector(
    organizationId: string,
    loginAttemptId: string,
    sessionString: string,
    name: string,
    isPrimary = false,
  ) {
    const pending = this.getPending(organizationId, loginAttemptId);
    const connector = await this.prisma.client.connector.create({
      data: {
        organizationId,
        type: "TELEGRAM_MTPROTO",
        name,
        isPrimary,
        capabilities: JSON.stringify({
          text: true,
          image: true,
          video: true,
          audio: true,
          document: true,
          sticker: true,
          location: true,
          interactive: false,
          groups: true,
          templates: false,
          webhooks: false,
        }),
        config: JSON.stringify({
          apiId: pending.apiId,
          apiHash: pending.apiHash,
          encryptedSession: encryptSecret(sessionString),
        }),
      },
    });
    await pending.session.dispose();
    this.pendingLogins.delete(loginAttemptId);
    await loadConnectorsFromDb(this.prisma.client);
    return present(connector);
  }

  private getPending(organizationId: string, loginAttemptId: string): PendingLogin {
    const pending = this.pendingLogins.get(loginAttemptId);
    if (!pending || pending.organizationId !== organizationId) {
      throw new BadRequestException("Unknown or expired login attempt — start over");
    }
    return pending;
  }

  private evictExpiredLogins(): void {
    const now = Date.now();
    for (const [id, pending] of this.pendingLogins.entries()) {
      if (now - pending.createdAt > LOGIN_TTL_MS) {
        void pending.session.dispose();
        this.pendingLogins.delete(id);
      }
    }
  }

  async create(organizationId: string, dto: CreateConnectorDto) {
    const connector = await this.prisma.client.connector.create({
      data: {
        organizationId,
        type: dto.type,
        name: dto.name,
        isPrimary: dto.isPrimary ?? false,
        capabilities: JSON.stringify(dto.capabilities),
        config: JSON.stringify(dto.config),
        credentialRef: dto.credentialRef,
        rateLimitPerMinute: dto.rateLimitPerMinute,
        rateLimitPerHour: dto.rateLimitPerHour,
        rateLimitPerDay: dto.rateLimitPerDay,
        // Only Bot API connectors receive Telegram webhooks; MTProto/custom
        // middleware have their own auth (session/HMAC) and don't need one.
        webhookSecret: dto.type === "TELEGRAM_BOT" ? randomBytes(24).toString("hex") : null,
      },
    });

    // Re-hydrate the in-process registry immediately so a newly created
    // connector is usable without restarting the API/worker process.
    const { loaded, failed } = await loadConnectorsFromDb(this.prisma.client);
    this.logger.log(`Connector registry refreshed after create: ${loaded} loaded, ${failed} failed`);

    return present(connector);
  }

  async list(organizationId: string) {
    const rows = await this.prisma.client.connector.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
    return rows.map(present);
  }

  async setEnabled(organizationId: string, id: string, isEnabled: boolean) {
    await this.prisma.client.connector.updateMany({ where: { id, organizationId }, data: { isEnabled } });
    await loadConnectorsFromDb(this.prisma.client);
    const row = await this.prisma.client.connector.findUnique({ where: { id } });
    return row ? present(row) : null;
  }

  /**
   * Reveals the connector's webhook secret so it can be copied into the
   * `secret_token` parameter of Telegram's `setWebhook` call. Only makes
   * sense for TELEGRAM_BOT connectors — others have no webhook secret.
   */
  async getWebhookSecret(organizationId: string, id: string): Promise<{ webhookSecret: string | null }> {
    const row = await this.prisma.client.connector.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException("Connector not found");
    return { webhookSecret: row.webhookSecret };
  }

  /** Rotates the webhook secret — remember to also update it in Telegram's setWebhook call, or delivery will start failing verification. */
  async regenerateWebhookSecret(organizationId: string, id: string): Promise<{ webhookSecret: string }> {
    const row = await this.prisma.client.connector.findFirst({ where: { id, organizationId } });
    if (!row) throw new NotFoundException("Connector not found");
    const webhookSecret = randomBytes(24).toString("hex");
    await this.prisma.client.connector.update({ where: { id }, data: { webhookSecret } });
    return { webhookSecret };
  }

  /** Send caps (spec §28) — pass null to clear a given window's limit. */
  async setRateLimits(
    organizationId: string,
    id: string,
    limits: { rateLimitPerMinute?: number | null; rateLimitPerHour?: number | null; rateLimitPerDay?: number | null },
  ) {
    await this.prisma.client.connector.updateMany({ where: { id, organizationId }, data: limits });
    const row = await this.prisma.client.connector.findUnique({ where: { id } });
    return row ? present(row) : null;
  }
}
