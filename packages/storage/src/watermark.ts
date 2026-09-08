import { Jimp, loadFont, HorizontalAlign, VerticalAlign } from "jimp";
import { SANS_16_WHITE, SANS_32_WHITE } from "@jimp/plugin-print/fonts";

const WATERMARKABLE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

export function isWatermarkable(mimeType: string): boolean {
  return WATERMARKABLE_MIME_TYPES.has(mimeType);
}

/**
 * Overlays semi-transparent text (spec §70) across the bottom-right corner
 * of an image attachment — e.g. an org name or "CONFIDENTIAL" stamp. Only
 * JPEG/PNG are supported (Jimp's format coverage); other mime types are
 * left untouched by the caller (see attachments.service.ts), not silently
 * skipped without saying so.
 */
export async function applyWatermark(buffer: Buffer, text: string): Promise<Buffer> {
  const image = await Jimp.read(buffer);
  const font = await loadFont(image.width > 400 || image.height > 400 ? SANS_32_WHITE : SANS_16_WHITE);

  image.print({
    font,
    x: 0,
    y: 0,
    text: { text, alignmentX: HorizontalAlign.CENTER, alignmentY: VerticalAlign.BOTTOM },
    maxWidth: image.width,
    maxHeight: image.height,
  });

  return image.mime === "image/png" ? image.getBuffer("image/png") : image.getBuffer("image/jpeg");
}
