import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { WorkflowsService } from "./workflows.service";
import { CreateWorkflowDto } from "./dto/create-workflow.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, CurrentUserPayload } from "../common/current-user.decorator";
import { AuditService } from "../common/audit.service";

@UseGuards(JwtAuthGuard)
@Controller("workflows")
export class WorkflowsController {
  constructor(
    private readonly workflows: WorkflowsService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  async create(@Body() dto: CreateWorkflowDto, @CurrentUser() user: CurrentUserPayload) {
    const workflow = await this.workflows.create(user.organizationId, dto);
    await this.audit.log({ organizationId: user.organizationId, userId: user.userId, action: "workflow.created", entityType: "Workflow", entityId: workflow.id });
    return workflow;
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.workflows.list(user.organizationId);
  }

  @Post(":id/trigger")
  async trigger(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    const run = await this.workflows.trigger(user.organizationId, id);
    await this.audit.log({ organizationId: user.organizationId, userId: user.userId, action: "workflow.triggered", entityType: "WorkflowRun", entityId: run.id });
    return run;
  }

  @Post("runs/:runId/approve")
  async approve(@Param("runId") runId: string, @CurrentUser() user: CurrentUserPayload) {
    const result = await this.workflows.approve(user.organizationId, runId);
    await this.audit.log({ organizationId: user.organizationId, userId: user.userId, action: "workflow.run.approved", entityType: "WorkflowRun", entityId: runId });
    return result;
  }

  @Get(":id/runs")
  runs(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.workflows.runsFor(user.organizationId, id);
  }
}
