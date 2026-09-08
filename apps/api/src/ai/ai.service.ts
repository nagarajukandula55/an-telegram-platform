import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { getAiProvider, draftReply, translateText, proposeWorkflow } from "@an-tg/ai-core";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService) {}

  isEnabled(): boolean {
    return getAiProvider() !== null;
  }

  private requireProvider() {
    const provider = getAiProvider();
    if (!provider) {
      throw new ServiceUnavailableException(
        "AI features are not configured for this deployment — set AI_PROVIDER_URL and AI_PROVIDER_API_KEY to enable them",
      );
    }
    return provider;
  }

  /** Drafts a reply for a human to review and send — never sends anything itself. */
  async draftReply(organizationId: string, conversationId: string, tone?: string): Promise<{ draft: string }> {
    const provider = this.requireProvider();
    const conversation = await this.prisma.client.conversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 20 } },
    });
    if (!conversation || conversation.organizationId !== organizationId) {
      throw new NotFoundException("Conversation not found");
    }

    const draft = await draftReply(provider, {
      history: conversation.messages.map((m) => ({ direction: m.direction as "inbound" | "outbound", body: m.body })),
      tone,
    });
    return { draft };
  }

  async translate(text: string, targetLanguage: string): Promise<{ translated: string }> {
    const provider = this.requireProvider();
    const translated = await translateText(provider, text, targetLanguage);
    return { translated };
  }

  /** Returns a workflow definition proposal — never creates or activates a workflow itself; the caller reviews it in the visual builder before saving. */
  async proposeWorkflow(description: string) {
    const provider = this.requireProvider();
    return proposeWorkflow(provider, description);
  }
}
