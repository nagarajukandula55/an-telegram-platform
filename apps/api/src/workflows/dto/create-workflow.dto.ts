import { IsObject, IsString } from "class-validator";

export class CreateWorkflowDto {
  @IsString()
  name!: string;

  @IsObject()
  definition!: { nodes: Array<{ id: string; type: string; config: Record<string, unknown> }> };
}
