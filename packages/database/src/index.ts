import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";

/**
 * SQLite has no native enum type, so the columns these used to constrain
 * (User.role, Connector.type, Consent.status, etc.) are plain String
 * columns in schema.prisma. These TS union types are the application-level
 * replacement — same allowed values, enforced by class-validator DTOs and
 * TypeScript instead of the database.
 */
export type OrgRole =
  | "SUPER_ADMIN"
  | "TENANT_ADMIN"
  | "MANAGER"
  | "CAMPAIGN_MANAGER"
  | "OPERATOR"
  | "AGENT"
  | "DEVELOPER"
  | "AUDITOR"
  | "READ_ONLY";

export type ConnectorType = "TELEGRAM_BOT" | "TELEGRAM_MTPROTO" | "CUSTOM_MIDDLEWARE";

export type ConsentStatus = "OPTED_IN" | "OPTED_OUT" | "UNKNOWN";

export type TemplateApprovalStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";

export type MessageStatus =
  | "DRAFT"
  | "VALIDATED"
  | "QUEUED"
  | "SENDING"
  | "ACCEPTED"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED"
  | "UNKNOWN";

export type CampaignStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "WAITING_APPROVAL"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "PARTIALLY_FAILED"
  | "FAILED"
  | "CANCELLED";
