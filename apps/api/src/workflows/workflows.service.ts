import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { enqueue, QUEUE_NAMES } from "@an-tg/queue";
import { PrismaService } from "../common/prisma.service";
import { CreateWorkflowDto } from "./dto/create-workflow.dto";

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  create(organizationId: string, dto: CreateWorkflowDto) {
    return this.prisma.client.workflow.create({
      data: { organizationId, name: dto.name, definition: JSON.stringify(dto.definition) },
    });
  }

  list(organizationId: string) {
    return this.prisma.client.workflow.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
  }

  async trigger(organizationId: string, workflowId: string) {
    const workflow = await this.prisma.client.workflow.findUnique({ where: { id: workflowId } });
    if (!workflow || workflow.organizationId !== organizationId) {
      throw new NotFoundException("Workflow not found");
    }
    if (!workflow.isActive) {
      throw new BadRequestException("Workflow is not active");
    }

    const run = await this.prisma.client.workflowRun.create({ data: { workflowId: workflow.id, status: "running" } });
    await enqueue(this.prisma.client, QUEUE_NAMES.WORKFLOW, { workflowRunId: run.id, workflowId: workflow.id, stepIndex: 0 });
    return run;
  }

  /** Resumes a run paused at a `human_approval` node by enqueueing the next step. */
  async approve(organizationId: string, workflowRunId: string) {
    const run = await this.prisma.client.workflowRun.findUnique({ where: { id: workflowRunId }, include: { workflow: true } });
    if (!run || run.workflow.organizationId !== organizationId) {
      throw new NotFoundException("Workflow run not found");
    }
    if (run.status !== "awaiting_approval") {
      throw new BadRequestException(`Run is in status "${run.status}", not awaiting approval`);
    }

    const lastStep = await this.prisma.client.workflowStepRun.findFirst({
      where: { workflowRunId: run.id },
      orderBy: { startedAt: "desc" },
    });
    const definition = JSON.parse(run.workflow.definition) as { nodes: Array<{ id: string }> };
    const lastIndex = lastStep ? definition.nodes.findIndex((n) => n.id === lastStep.nodeId) : -1;

    await this.prisma.client.workflowRun.update({ where: { id: run.id }, data: { status: "running" } });
    await enqueue(this.prisma.client, QUEUE_NAMES.WORKFLOW, { workflowRunId: run.id, workflowId: run.workflowId, stepIndex: lastIndex + 1 });
    return { resumed: true };
  }

  runsFor(organizationId: string, workflowId: string) {
    return this.prisma.client.workflowRun.findMany({
      where: { workflow: { id: workflowId, organizationId } },
      include: { stepRuns: true },
      orderBy: { startedAt: "desc" },
      take: 50,
    });
  }
}
