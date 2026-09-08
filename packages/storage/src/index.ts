import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export * from "./malware-scan";
export * from "./watermark";

function storageDir(): string {
  return process.env.ATTACHMENT_STORAGE_DIR ?? path.join(process.cwd(), "data", "attachments");
}

function signingSecret(): string {
  return process.env.ATTACHMENT_SIGNING_SECRET ?? "change-me-in-every-environment";
}

function publicApiUrl(): string {
  return process.env.PUBLIC_API_URL ?? "http://localhost:4000";
}

export interface UploadResult {
  /** Relative key under the storage dir, e.g. "org_123/ab12cd-invoice.pdf" — stored as Attachment.storageLocation. */
  storageLocation: string;
  storedName: string;
  hash: string;
  sizeBytes: number;
}

/**
 * Local-disk attachment store — no MinIO/S3/Docker required. Files live
 * under ATTACHMENT_STORAGE_DIR (default ./data/attachments), organized by
 * organizationId. Not suitable for a multi-instance deployment (each
 * instance would need its own copy or a shared volume), which is an
 * explicit tradeoff for staying dependency-free locally.
 */
export async function uploadAttachment(params: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  organizationId: string;
}): Promise<UploadResult> {
  const hash = createHash("sha256").update(params.buffer).digest("hex");
  const safeName = params.originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storedName = `${params.organizationId}/${hash}-${safeName}`;
  const absolutePath = path.join(storageDir(), storedName);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, params.buffer);

  return { storageLocation: storedName, storedName, hash, sizeBytes: params.buffer.byteLength };
}

export function resolveAttachmentPath(storedName: string): string {
  // storedName always comes from our own uploadAttachment output (org
  // cuid + hash-derived filename), never directly from user input, so a
  // plain join is safe — but defensively reject any attempt to escape
  // the storage root via "..".
  if (storedName.includes("..")) {
    throw new Error("Invalid attachment key");
  }
  return path.join(storageDir(), storedName);
}

function sign(storedName: string, expires: number): string {
  return createHmac("sha256", signingSecret()).update(`${storedName}:${expires}`).digest("hex");
}

/**
 * Returns a time-limited download URL pointing at this API's own
 * /attachments/file route (see apps/api/src/attachments/attachments.controller.ts),
 * signed with an HMAC — the local-disk equivalent of an S3 presigned URL.
 * Never a permanent public link.
 */
export function getSignedDownloadUrl(storedName: string, expiresInSeconds = 3600): string {
  const expires = Date.now() + expiresInSeconds * 1000;
  const sig = sign(storedName, expires);
  const params = new URLSearchParams({ key: storedName, expires: String(expires), sig });
  return `${publicApiUrl()}/attachments/file?${params.toString()}`;
}

export function verifyDownloadToken(storedName: string, expires: number, sig: string): boolean {
  if (Date.now() > expires) return false;
  const expected = sign(storedName, expires);
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(sig);
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}
