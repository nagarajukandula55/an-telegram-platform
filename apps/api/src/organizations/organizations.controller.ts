import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { OrganizationsService } from "./organizations.service";
import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { AuditService } from "../common/audit.service";
import { CurrentUser, CurrentUserPayload } from "../common/current-user.decorator";

@Controller("organizations")
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly audit: AuditService,
  ) {}

  // Org creation is unauthenticated (bootstrap step for a brand new tenant).
  // Every subsequent action within that org requires a logged-in user.
  @Post()
  async create(@Body() dto: CreateOrganizationDto) {
    const org = await this.organizations.create(dto);
    await this.audit.log({ organizationId: org.id, action: "organization.created", entityType: "Organization", entityId: org.id });
    return org;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SUPER_ADMIN", "TENANT_ADMIN")
  @Get(":id")
  async get(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    if (user.organizationId !== id && user.role !== "SUPER_ADMIN") {
      return { error: "Not found" };
    }
    return this.organizations.findById(id);
  }
}
