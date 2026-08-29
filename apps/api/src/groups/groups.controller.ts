import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { GroupsService } from "./groups.service";
import { CreateGroupDto } from "./dto/create-group.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, CurrentUserPayload } from "../common/current-user.decorator";
import { AuditService } from "../common/audit.service";

@UseGuards(JwtAuthGuard)
@Controller("groups")
export class GroupsController {
  constructor(
    private readonly groups: GroupsService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  async create(@Body() dto: CreateGroupDto, @CurrentUser() user: CurrentUserPayload) {
    const group = await this.groups.create(user.organizationId, dto);
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: "group.created",
      entityType: "Group",
      entityId: group.id,
    });
    return group;
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.groups.list(user.organizationId);
  }
}
