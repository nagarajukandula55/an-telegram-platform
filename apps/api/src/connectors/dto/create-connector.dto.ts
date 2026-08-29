import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from "class-validator";

export class CreateConnectorDto {
  @IsString()
  name!: string;

  @IsIn(["TELEGRAM_MTPROTO", "TELEGRAM_BOT", "CUSTOM_MIDDLEWARE"])
  type!: "TELEGRAM_MTPROTO" | "TELEGRAM_BOT" | "CUSTOM_MIDDLEWARE";

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  /** Config specific to the connector type — see connector-loader.service.ts for the shape each type reads. */
  @IsObject()
  config!: Record<string, unknown>;

  /**
   * Displayed/UI-facing capability flags (spec §71 capability matrix).
   * For TELEGRAM_BOT/TELEGRAM_MTPROTO the actual send-time capability
   * check uses the adapter's own getCapabilities(), so these mainly drive
   * what the composer UI shows; for CUSTOM_MIDDLEWARE this is authoritative.
   */
  @IsObject()
  capabilities!: Record<string, boolean>;

  /**
   * Name of an environment variable holding the secret (access token /
   * signing secret / agent auth token) — never the secret itself. Set the
   * actual value in .env on the machine running the API/worker.
   */
  @IsOptional()
  @IsString()
  credentialRef?: string;
}
