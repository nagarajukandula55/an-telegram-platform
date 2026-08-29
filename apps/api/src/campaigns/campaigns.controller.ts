import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CampaignsService } from "./campaigns.service";
import { CreateCampaignDto } from "./dto/create-campaign.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, CurrentUserPayload } from "../common/current-user.decorator";
import { AuditService } from "../common/audit.service";

@UseGuards(JwtAuthGuard)
@Controller("campaigns")
export class CampaignsController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  async create(@Body() dto: CreateCampaignDto, @CurrentUser() user: CurrentUserPayload) {
    const campaign = await this.campaigns.create(user.organizationId, dto);
    await this.audit.log({ organizationId: user.organizationId, userId: user.userId, action: "campaign.created", entityType: "Campaign", entityId: campaign.id });
    return campaign;
  }

  @Post(":id/launch")
  async launch(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    const campaign = await this.campaigns.launch(user.organizationId, id, user.role);
    await this.audit.log({ organizationId: user.organizationId, userId: user.userId, action: "campaign.launched", entityType: "Campaign", entityId: campaign.id });
    return campaign;
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.campaigns.list(user.organizationId);
  }

  @Get(":id/report")
  report(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.campaigns.report(user.organizationId, id);
  }
}
