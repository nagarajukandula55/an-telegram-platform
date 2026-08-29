import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

interface AuditEntry {
  organizationId: string;
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.prisma.client.auditLog.create({
      data: { ...entry, metadata: entry.metadata ? JSON.stringify(entry.metadata) : undefined },
    });
  }
}
