import { describe, expect, it } from "vitest";
import { classifyError, isRetryable, nextRetryDelayMs } from "./retry";

describe("classifyError", () => {
  it("returns UNKNOWN for an undefined code", () => {
    expect(classifyError(undefined)).toBe("UNKNOWN");
  });

  it("returns UNKNOWN for an unrecognized code", () => {
    expect(classifyError("SOME_NEW_CODE")).toBe("UNKNOWN");
  });

  it("maps known codes to their category", () => {
    expect(classifyError("RECIPIENT_INVALID")).toBe("INVALID_RECIPIENT");
    expect(classifyError("CONSENT_REQUIRED")).toBe("POLICY");
    expect(classifyError("RATE_LIMITED")).toBe("TRANSIENT");
    expect(classifyError("AUTH_FAILED")).toBe("AUTHENTICATION");
  });
});

describe("isRetryable", () => {
  it("is false for permanent/policy/invalid-recipient/authentication categories", () => {
    expect(isRetryable("PERMANENT")).toBe(false);
    expect(isRetryable("POLICY")).toBe(false);
    expect(isRetryable("INVALID_RECIPIENT")).toBe(false);
    expect(isRetryable("AUTHENTICATION")).toBe(false);
  });

  it("is true for transient/provider/timeout/unknown categories", () => {
    expect(isRetryable("TRANSIENT")).toBe(true);
    expect(isRetryable("PROVIDER")).toBe(true);
    expect(isRetryable("TIMEOUT")).toBe(true);
    expect(isRetryable("UNKNOWN")).toBe(true);
  });
});

describe("nextRetryDelayMs", () => {
  it("follows the 30s / 2m / 10m backoff schedule", () => {
    expect(nextRetryDelayMs(1)).toBe(30_000);
    expect(nextRetryDelayMs(2)).toBe(120_000);
    expect(nextRetryDelayMs(3)).toBe(600_000);
  });

  it("returns null once the schedule is exhausted", () => {
    expect(nextRetryDelayMs(4)).toBeNull();
    expect(nextRetryDelayMs(99)).toBeNull();
  });
});
