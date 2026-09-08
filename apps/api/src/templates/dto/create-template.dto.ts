import { IsIn, IsOptional, IsString } from "class-validator";

export class CreateTemplateDto {
  @IsString()
  name!: string;

  /** Body may contain {{contact.field}} / {{variables.field}} placeholders — see packages/messaging-core's renderTemplate(). */
  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsIn(["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"])
  approvalStatus?: string;
}
