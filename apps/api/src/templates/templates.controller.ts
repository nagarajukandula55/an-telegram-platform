import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { TemplatesService } from "./templates.service";
import { CreateTemplateDto } from "./dto/create-template.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, CurrentUserPayload } from "../common/current-user.decorator";
import { AuditService } from "../common/audit.service";

@UseGuards(JwtAuthGuard)
@Controller("templates")
export class TemplatesController {
  constructor(
    private readonly templates: TemplatesService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  async create(@Body() dto: CreateTemplateDto, @CurrentUser() user: CurrentUserPayload) {
    const template = await this.templates.create(user.organizationId, dto);
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: "template.created",
      entityType: "Template",
      entityId: template.id,
    });
    return template;
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.templates.list(user.organizationId);
  }
}
