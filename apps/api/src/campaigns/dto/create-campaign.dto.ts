import { IsArray, IsOptional, IsString } from "class-validator";

export class CreateCampaignDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsString()
  connectorId!: string;

  /** At least one of recipientContactIds/recipientGroupIds must be non-empty (checked in the service). */
  @IsOptional()
  @IsArray()
  recipientContactIds?: string[];

  @IsOptional()
  @IsArray()
  recipientGroupIds?: string[];
}
