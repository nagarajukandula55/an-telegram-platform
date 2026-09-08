import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ConversationsService } from "./conversations.service";
import { ReplyConversationDto } from "./dto/reply-conversation.dto";
import { AssignConversationDto } from "./dto/assign-conversation.dto";
import { SetConversationStatusDto } from "./dto/set-status.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, CurrentUserPayload } from "../common/current-user.decorator";
import { AuditService } from "../common/audit.service";

@UseGuards(JwtAuthGuard)
@Controller("conversations")
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@Query("status") status: string | undefined, @CurrentUser() user: CurrentUserPayload) {
    return this.conversations.list(user.organizationId, status);
  }

  @Get(":id")
  get(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.conversations.get(user.organizationId, id);
  }

  @Patch(":id/assign")
  async assign(@Param("id") id: string, @Body() dto: AssignConversationDto, @CurrentUser() user: CurrentUserPayload) {
    const conversation = await this.conversations.assign(user.organizationId, id, dto.userId);
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: "conversation.assigned",
      entityType: "Conversation",
      entityId: id,
      metadata: { assignedToId: dto.userId ?? null },
    });
    return conversation;
  }

  @Patch(":id/status")
  async setStatus(@Param("id") id: string, @Body() dto: SetConversationStatusDto, @CurrentUser() user: CurrentUserPayload) {
    const conversation = await this.conversations.setStatus(user.organizationId, id, dto.status);
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: "conversation.status_changed",
      entityType: "Conversation",
      entityId: id,
      metadata: { status: dto.status },
    });
    return conversation;
  }

  @Post(":id/reply")
  async reply(@Param("id") id: string, @Body() dto: ReplyConversationDto, @CurrentUser() user: CurrentUserPayload) {
    const result = await this.conversations.reply(user.organizationId, id, dto);
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: "conversation.replied",
      entityType: "Conversation",
      entityId: id,
    });
    return result;
  }
}
