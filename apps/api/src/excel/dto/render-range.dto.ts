import { IsOptional, IsString } from "class-validator";

export class RenderRangeDto {
  /** e.g. "A1:F20". */
  @IsString()
  range!: string;

  @IsOptional()
  @IsString()
  sheetName?: string;

  @IsOptional()
  @IsString()
  title?: string;
}
