import { ConflictException, Injectable } from "@nestjs/common";
import { checkSendable } from "@an-tg/messaging-core";
import * as XLSX from "xlsx";
import { PrismaService } from "../common/prisma.service";
import { CreateContactDto } from "./dto/create-contact.dto";

export interface ImportRowResult {
  row: number;
  phone?: string;
  status: "created" | "skipped_duplicate" | "skipped_invalid";
  reason?: string;
}

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateContactDto) {
    const existing = await this.prisma.client.contact.findUnique({
      where: { organizationId_phone: { organizationId, phone: dto.phone } },
    });
    if (existing) {
      throw new ConflictException(`Contact with phone "${dto.phone}" already exists`);
    }
    const { tags, ...rest } = dto;
    return this.prisma.client.contact.create({ data: { organizationId, ...rest, tags: JSON.stringify(tags ?? []) } });
  }

  list(organizationId: string, params: { skip?: number; take?: number; search?: string } = {}) {
    const { skip = 0, take = 50, search } = params;
    return this.prisma.client.contact.findMany({
      where: {
        organizationId,
        ...(search
          ? { OR: [{ name: { contains: search } }, { phone: { contains: search } }] } // SQLite's LIKE is case-insensitive for ASCII by default; no `mode` option to set
          : {}),
      },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });
  }

  isSendable(organizationId: string, phone: string) {
    return checkSendable(this.prisma.client, organizationId, phone);
  }

  /**
   * Bulk import from an uploaded CSV/XLSX buffer (spec §87). Expects
   * columns named "phone" (required) and optionally "name", "email",
   * "language", "tags" (comma-separated). Column matching is
   * case-insensitive; a real mapping wizard (arbitrary column -> field)
   * is a Phase 2 follow-up — this covers the common straightforward case.
   */
  async importFromFile(organizationId: string, buffer: Buffer): Promise<{ results: ImportRowResult[]; created: number }> {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });

    const results: ImportRowResult[] = [];
    let created = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const normalized = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v]));
      const phone = String(normalized.phone ?? "").replace(/[^\d+]/g, "");

      if (!phone) {
        results.push({ row: i + 2, status: "skipped_invalid", reason: "Missing phone number" });
        continue;
      }

      const existing = await this.prisma.client.contact.findUnique({
        where: { organizationId_phone: { organizationId, phone } },
      });
      if (existing) {
        results.push({ row: i + 2, phone, status: "skipped_duplicate" });
        continue;
      }

      await this.prisma.client.contact.create({
        data: {
          organizationId,
          phone,
          name: normalized.name ? String(normalized.name) : undefined,
          email: normalized.email ? String(normalized.email) : undefined,
          language: normalized.language ? String(normalized.language) : undefined,
          tags: JSON.stringify(normalized.tags ? String(normalized.tags).split(",").map((t) => t.trim()).filter(Boolean) : []),
          source: "import",
        },
      });
      created++;
      results.push({ row: i + 2, phone, status: "created" });
    }

    return { results, created };
  }
}
