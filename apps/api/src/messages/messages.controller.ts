import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { MessagesService } from "./messages.service";
import { SendMessageDto } from "./dto/send-message.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, CurrentUserPayload } from "../common/current-user.decorator";
import { AuditService } from "../common/audit.service";

@UseGuards(JwtAuthGuard)
@Controller("messages")
export class MessagesController {
  constructor(
    private readonly messages: MessagesService,
    private readonly audit: AuditService,
  ) {}

  @Post("send")
  async send(@Body() dto: SendMessageDto, @CurrentUser() user: CurrentUserPayload) {
    const message = await this.messages.send(user.organizationId, dto);
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: "message.send",
      entityType: "Message",
      entityId: message.id,
      metadata: { status: message.status },
    });
    return message;
  }
}
