export type ErrorCategory =
  | "TRANSIENT"
  | "PERMANENT"
  | "POLICY"
  | "AUTHENTICATION"
  | "INVALID_RECIPIENT"
  | "PROVIDER"
  | "ATTACHMENT"
  | "TIMEOUT"
  | "UNKNOWN";

const NON_RETRYABLE: ReadonlySet<ErrorCategory> = new Set(["PERMANENT", "POLICY", "INVALID_RECIPIENT", "AUTHENTICATION"]);

const CODE_TO_CATEGORY: Record<string, ErrorCategory> = {
  RECIPIENT_INVALID: "INVALID_RECIPIENT",
  RECIPIENT_NOT_FOUND: "INVALID_RECIPIENT",
  CONSENT_REQUIRED: "POLICY",
  CONTENT_NOT_SUPPORTED: "PERMANENT",
  ATTACHMENT_TOO_LARGE: "ATTACHMENT",
  ATTACHMENT_INVALID: "ATTACHMENT",
  CONNECTOR_OFFLINE: "TRANSIENT",
  AUTH_FAILED: "AUTHENTICATION",
  RATE_LIMITED: "TRANSIENT",
  PROVIDER_REJECTED: "PROVIDER",
  TEMPLATE_REJECTED: "PERMANENT",
  TIMEOUT: "TIMEOUT",
  DUPLICATE: "PERMANENT",
  POLICY_BLOCKED: "POLICY",
  WEB_SESSION_EXPIRED: "TRANSIENT",
};

export function classifyError(errorCode?: string): ErrorCategory {
  if (!errorCode) return "UNKNOWN";
  return CODE_TO_CATEGORY[errorCode] ?? "UNKNOWN";
}

export function isRetryable(category: ErrorCategory): boolean {
  return !NON_RETRYABLE.has(category);
}

/** Backoff schedule per spec §30: 30s, 2m, 10m, then give up. */
export function nextRetryDelayMs(attemptNumber: number): number | null {
  const schedule = [30_000, 120_000, 600_000];
  return schedule[attemptNumber - 1] ?? null;
}
