import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Symmetric encryption-at-rest for secrets that must live in the database
 * rather than an env var — chiefly MTProto session strings, which are
 * generated at runtime by the phone/code/2FA login flow and have nowhere
 * else to live. Bot API tokens and other static credentials still follow
 * the simpler `credentialRef` -> env var pattern used elsewhere.
 *
 * Key material comes from CREDENTIAL_ENCRYPTION_KEY (any passphrase string,
 * stretched via scrypt) — set a real random value in production. AES-256-GCM
 * gives us both confidentiality and tamper-detection (auth tag).
 */
const ALGO = "aes-256-gcm";

function deriveKey(): Buffer {
  const passphrase = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!passphrase) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY is not set — required to encrypt/decrypt connector secrets (e.g. MTProto session strings) at rest.",
    );
  }
  return scryptSync(passphrase, "an-tg-connector-secrets", 32);
}

/** Returns a single self-contained string: "v1:<ivHex>:<authTagHex>:<cipherHex>". */
export function encryptSecret(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(payload: string): string {
  const [version, ivHex, tagHex, cipherHex] = payload.split(":");
  if (version !== "v1" || !ivHex || !tagHex || !cipherHex) {
    throw new Error("Malformed encrypted secret payload");
  }
  const key = deriveKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(cipherHex, "hex")), decipher.final()]).toString("utf8");
}
