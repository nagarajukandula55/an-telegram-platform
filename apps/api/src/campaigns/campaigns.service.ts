import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { enqueue, QUEUE_NAMES } from "@an-tg/queue";
import { PrismaService } from "../common/prisma.service";
import { CreateCampaignDto } from "./dto/create-campaign.dto";

const HIGH_VOLUME_APPROVAL_THRESHOLD = 500;

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateCampaignDto) {
    const contacts = dto.recipientContactIds?.length
      ? await this.prisma.client.contact.findMany({ where: { organizationId, id: { in: dto.recipientContactIds } } })
      : [];
    const groups = dto.recipientGroupIds?.length
      ? await this.prisma.client.group.findMany({ where: { organizationId, id: { in: dto.recipientGroupIds } } })
      : [];

    if (contacts.length === 0 && groups.length === 0) {
      throw new BadRequestException("No valid recipients found for this organization");
    }

    const requiresApproval = contacts.length + groups.length > HIGH_VOLUME_APPROVAL_THRESHOLD;

    return this.prisma.client.campaign.create({
      data: {
        organizationId,
        name: dto.name,
        templateId: dto.templateId,
        connectorId: dto.connectorId,
        status: requiresApproval ? "WAITING_APPROVAL" : "DRAFT",
        recipients: {
          create: [...contacts.map((c) => ({ contactId: c.id })), ...groups.map((g) => ({ groupId: g.id }))],
        },
      },
      include: { recipients: true },
    });
  }

  async launch(organizationId: string, campaignId: string, approverRole: string) {
    const campaign = await this.prisma.client.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.organizationId !== organizationId) {
      throw new NotFoundException("Campaign not found");
    }

    if (campaign.status === "WAITING_APPROVAL" && !["MANAGER", "TENANT_ADMIN", "SUPER_ADMIN", "CAMPAIGN_MANAGER"].includes(approverRole)) {
      throw new ForbiddenException("This campaign requires manager approval before launch");
    }

    if (!["DRAFT", "WAITING_APPROVAL", "SCHEDULED"].includes(campaign.status)) {
      throw new BadRequestException(`Campaign in status "${campaign.status}" cannot be launched`);
    }

    await enqueue(this.prisma.client, QUEUE_NAMES.CAMPAIGN, { campaignId: campaign.id });
    return this.prisma.client.campaign.update({ where: { id: campaign.id }, data: { status: "RUNNING" } });
  }

  list(organizationId: string) {
    return this.prisma.client.campaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { recipients: true, messages: true } } },
    });
  }

  async report(organizationId: string, campaignId: string) {
    const campaign = await this.prisma.client.campaign.findUnique({
      where: { id: campaignId },
      include: { messages: { select: { status: true } } },
    });
    if (!campaign || campaign.organizationId !== organizationId) {
      throw new NotFoundException("Campaign not found");
    }

    const byStatus = campaign.messages.reduce<Record<string, number>>((acc, m) => {
      acc[m.status] = (acc[m.status] ?? 0) + 1;
      return acc;
    }, {});

    return { campaignId: campaign.id, name: campaign.name, status: campaign.status, totalMessages: campaign.messages.length, byStatus };
  }
}
