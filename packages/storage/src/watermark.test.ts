import { Jimp } from "jimp";
import { describe, expect, it } from "vitest";
import { applyWatermark, isWatermarkable } from "./watermark";

describe("isWatermarkable", () => {
  it("allows jpeg and png", () => {
    expect(isWatermarkable("image/jpeg")).toBe(true);
    expect(isWatermarkable("image/png")).toBe(true);
  });

  it("rejects other mime types", () => {
    expect(isWatermarkable("application/pdf")).toBe(false);
    expect(isWatermarkable("video/mp4")).toBe(false);
  });
});

describe("applyWatermark", () => {
  it("returns a valid, re-readable image with the same dimensions as the input", async () => {
    const original = new Jimp({ width: 120, height: 80, color: 0x336699ff });
    const inputBuffer = await original.getBuffer("image/png");

    const watermarked = await applyWatermark(inputBuffer, "CONFIDENTIAL");

    const reread = await Jimp.read(watermarked);
    expect(reread.width).toBe(120);
    expect(reread.height).toBe(80);
  });

  it("actually changes pixel data (the watermark text is drawn, not a no-op)", async () => {
    const original = new Jimp({ width: 120, height: 80, color: 0x000000ff });
    const inputBuffer = await original.getBuffer("image/png");

    const watermarked = await applyWatermark(inputBuffer, "TEST");

    expect(Buffer.compare(inputBuffer, watermarked)).not.toBe(0);
  });
});
