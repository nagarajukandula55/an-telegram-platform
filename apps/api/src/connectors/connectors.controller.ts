import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ConnectorsService } from "./connectors.service";
import { CreateConnectorDto } from "./dto/create-connector.dto";
import { SetRateLimitsDto } from "./dto/set-rate-limits.dto";
import {
  FinalizeMtprotoConnectorDto,
  StartMtprotoLoginDto,
  SubmitMtprotoCodeDto,
  SubmitMtprotoPasswordDto,
} from "./dto/mtproto-login.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser, CurrentUserPayload } from "../common/current-user.decorator";
import { AuditService } from "../common/audit.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("connectors")
export class ConnectorsController {
  constructor(
    private readonly connectors: ConnectorsService,
    private readonly audit: AuditService,
  ) {}

  @Roles("TENANT_ADMIN", "SUPER_ADMIN", "DEVELOPER")
  @Post()
  async create(@Body() dto: CreateConnectorDto, @CurrentUser() user: CurrentUserPayload) {
    const connector = await this.connectors.create(user.organizationId, dto);
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: "connector.created",
      entityType: "Connector",
      entityId: connector.id,
      metadata: { type: connector.type },
    });
    return connector;
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.connectors.list(user.organizationId);
  }

  @Roles("TENANT_ADMIN", "SUPER_ADMIN", "DEVELOPER")
  @Patch(":id/enabled")
  async setEnabled(@Param("id") id: string, @Body("isEnabled") isEnabled: boolean, @CurrentUser() user: CurrentUserPayload) {
    const connector = await this.connectors.setEnabled(user.organizationId, id, isEnabled);
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: isEnabled ? "connector.enabled" : "connector.disabled",
      entityType: "Connector",
      entityId: id,
    });
    return connector;
  }

  @Roles("TENANT_ADMIN", "SUPER_ADMIN", "DEVELOPER")
  @Patch(":id/rate-limits")
  async setRateLimits(@Param("id") id: string, @Body() dto: SetRateLimitsDto, @CurrentUser() user: CurrentUserPayload) {
    const connector = await this.connectors.setRateLimits(user.organizationId, id, dto);
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: "connector.rate_limits_updated",
      entityType: "Connector",
      entityId: id,
      metadata: { ...dto },
    });
    return connector;
  }

  @Roles("TENANT_ADMIN", "SUPER_ADMIN", "DEVELOPER")
  @Get(":id/webhook-secret")
  getWebhookSecret(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.connectors.getWebhookSecret(user.organizationId, id);
  }

  @Roles("TENANT_ADMIN", "SUPER_ADMIN", "DEVELOPER")
  @Post(":id/webhook-secret/regenerate")
  async regenerateWebhookSecret(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    const result = await this.connectors.regenerateWebhookSecret(user.organizationId, id);
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: "connector.webhook_secret_regenerated",
      entityType: "Connector",
      entityId: id,
    });
    return result;
  }

  // -- MTProto interactive login (phone -> code -> optional 2FA -> finalize) --

  @Roles("TENANT_ADMIN", "SUPER_ADMIN", "DEVELOPER")
  @Post("mtproto/login/start")
  startLogin(@Body() dto: StartMtprotoLoginDto, @CurrentUser() user: CurrentUserPayload) {
    return this.connectors.startMtprotoLogin(user.organizationId, dto);
  }

  @Roles("TENANT_ADMIN", "SUPER_ADMIN", "DEVELOPER")
  @Post("mtproto/login/code")
  submitCode(@Body() dto: SubmitMtprotoCodeDto, @CurrentUser() user: CurrentUserPayload) {
    return this.connectors.submitMtprotoCode(user.organizationId, dto.loginAttemptId, dto.code);
  }

  @Roles("TENANT_ADMIN", "SUPER_ADMIN", "DEVELOPER")
  @Post("mtproto/login/password")
  submitPassword(@Body() dto: SubmitMtprotoPasswordDto, @CurrentUser() user: CurrentUserPayload) {
    return this.connectors.submitMtprotoPassword(user.organizationId, dto.loginAttemptId, dto.password);
  }

  @Roles("TENANT_ADMIN", "SUPER_ADMIN", "DEVELOPER")
  @Post("mtproto/login/finalize")
  async finalize(
    @Body() dto: FinalizeMtprotoConnectorDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const connector = await this.connectors.finalizeMtprotoConnector(
      user.organizationId,
      dto.loginAttemptId,
      dto.sessionString,
      dto.name,
      dto.isPrimary ?? false,
    );
    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.userId,
      action: "connector.mtproto_login_completed",
      entityType: "Connector",
      entityId: connector.id,
    });
    return connector;
  }
}
