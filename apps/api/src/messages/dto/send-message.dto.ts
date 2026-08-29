import { IsIn, IsOptional, IsString } from "class-validator";

export class SendMessageDto {
  @IsString()
  connectorId!: string;

  /** Exactly one of toPhone/toGroupId required. */
  @IsOptional()
  @IsString()
  toPhone?: string;

  /** Id of a Group row (see POST /groups). */
  @IsOptional()
  @IsString()
  toGroupId?: string;

  @IsIn(["text", "image", "video", "audio", "document", "template"])
  contentType!: "text" | "image" | "video" | "audio" | "document" | "template";

  @IsOptional()
  @IsString()
  body?: string;

  /** Id of a previously-uploaded Attachment row (see POST /attachments). */
  @IsOptional()
  @IsString()
  attachmentId?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
