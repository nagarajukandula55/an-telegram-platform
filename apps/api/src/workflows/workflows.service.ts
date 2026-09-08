import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { enqueue, QUEUE_NAMES } from "@an-tg/queue";
import { PrismaService } from "../common/prisma.service";
import { CreateWorkflowDto } from "./dto/create-workflow.dto";

interface WorkflowDefinition {
  nodes: Array<{ id: string }>;
  edges: Array<{ from: string; to: string; when?: string }>;
  startNodeId: string;
}

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  create(organizationId: string, dto: CreateWorkflowDto) {
    const definition = dto.definition as unknown as WorkflowDefinition;
    if (!definition.startNodeId || !definition.nodes?.some((n) => n.id === definition.startNodeId)) {
      throw new BadRequestException("definition.startNodeId must reference an existing node");
    }
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

    const definition = JSON.parse(workflow.definition) as WorkflowDefinition;
    const run = await this.prisma.client.workflowRun.create({ data: { workflowId: workflow.id, status: "running" } });
    await enqueue(this.prisma.client, QUEUE_NAMES.WORKFLOW, { workflowRunId: run.id, workflowId: workflow.id, nodeId: definition.startNodeId });
    return run;
  }

  /** Resumes a run paused at a `human_approval` node by enqueueing the node its one outgoing edge points to. */
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
    const definition = JSON.parse(run.workflow.definition) as WorkflowDefinition;
    const nextEdge = lastStep ? definition.edges.find((e) => e.from === lastStep.nodeId) : undefined;

    await this.prisma.client.workflowRun.update({ where: { id: run.id }, data: { status: "running" } });

    if (!nextEdge) {
      await this.prisma.client.workflowRun.update({ where: { id: run.id }, data: { status: "completed", finishedAt: new Date() } });
      return { resumed: true, completed: true };
    }

    await enqueue(this.prisma.client, QUEUE_NAMES.WORKFLOW, { workflowRunId: run.id, workflowId: run.workflowId, nodeId: nextEdge.to });
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
