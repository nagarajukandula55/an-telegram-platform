import { IsInt, IsOptional, IsPositive } from "class-validator";

/** Omit a field (or send it as null) to clear that window's cap — unlimited. */
export class SetRateLimitsDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  rateLimitPerMinute?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  rateLimitPerHour?: number | null;

  @IsOptional()
  @IsInt()
  @IsPositive()
  rateLimitPerDay?: number | null;
}
