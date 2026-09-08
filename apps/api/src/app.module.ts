import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { ContactsModule } from "./contacts/contacts.module";
import { GroupsModule } from "./groups/groups.module";
import { MessagesModule } from "./messages/messages.module";
import { ConnectorsModule } from "./connectors/connectors.module";
import { AttachmentsModule } from "./attachments/attachments.module";
import { CampaignsModule } from "./campaigns/campaigns.module";
import { TemplatesModule } from "./templates/templates.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { AiModule } from "./ai/ai.module";
import { WorkflowsModule } from "./workflows/workflows.module";
import { WebhooksModule } from "./webhooks/webhooks.module";

@Module({
  imports: [
    AuthModule,
    OrganizationsModule,
    ContactsModule,
    GroupsModule,
    ConnectorsModule,
    MessagesModule,
    AttachmentsModule,
    CampaignsModule,
    TemplatesModule,
    ConversationsModule,
    AiModule,
    WorkflowsModule,
    WebhooksModule,
  ],
})
export class AppModule {}
