import { IsString } from "class-validator";

export class ProposeWorkflowDto {
  @IsString()
  description!: string;
}
