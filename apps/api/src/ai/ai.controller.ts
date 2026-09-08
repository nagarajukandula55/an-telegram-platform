import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AiService } from "./ai.service";
import { DraftReplyDto } from "./dto/draft-reply.dto";
import { TranslateDto } from "./dto/translate.dto";
import { ProposeWorkflowDto } from "./dto/propose-workflow.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, CurrentUserPayload } from "../common/current-user.decorator";

/**
 * Phase 9 (Optional AI) — every endpoint here only ever returns suggested
 * text or a proposed (unsaved, inactive) workflow definition. Nothing in
 * this controller sends a message, creates a workflow, or triggers
 * anything by itself — see ai.service.ts's doc comments for how each
 * endpoint's caller is expected to keep a human in the loop.
 */
@UseGuards(JwtAuthGuard)
@Controller("ai")
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get("status")
  status() {
    return { enabled: this.ai.isEnabled() };
  }

  @Post("draft-reply")
  draftReply(@Body() dto: DraftReplyDto, @CurrentUser() user: CurrentUserPayload) {
    return this.ai.draftReply(user.organizationId, dto.conversationId, dto.tone);
  }

  @Post("translate")
  translate(@Body() dto: TranslateDto) {
    return this.ai.translate(dto.text, dto.targetLanguage);
  }

  @Post("propose-workflow")
  proposeWorkflow(@Body() dto: ProposeWorkflowDto) {
    return this.ai.proposeWorkflow(dto.description);
  }
}
