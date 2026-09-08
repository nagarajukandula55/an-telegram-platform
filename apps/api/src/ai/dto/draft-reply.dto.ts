import { IsOptional, IsString } from "class-validator";

export class DraftReplyDto {
  @IsString()
  conversationId!: string;

  @IsOptional()
  @IsString()
  tone?: string;
}
