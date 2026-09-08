import { IsObject, IsString } from "class-validator";

export class CreateWorkflowDto {
  @IsString()
  name!: string;

  /** Full shape/validation of nodes+edges+startNodeId lives in workflows.service.ts (create()) and apps/worker/src/processors/workflow.processor.ts. */
  @IsObject()
  definition!: {
    nodes: Array<{ id: string; type: string; config: Record<string, unknown> }>;
    edges: Array<{ from: string; to: string; when?: string }>;
    startNodeId: string;
  };
}
