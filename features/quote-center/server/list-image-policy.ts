// List-only technical limits, never attachment upload/product limits.
export const LIST_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const LIST_IMAGE_MAX_PIXELS = 1024 * 1024;
export const LIST_IMAGE_MAX_DIMENSION = 4096;
export const LIST_IMAGE_TOTAL_BYTES = 8 * 1024 * 1024;
export const LIST_IMAGE_TOTAL_PIXELS = 4 * LIST_IMAGE_MAX_PIXELS;
export type ListImageFailure = "unavailable" | "too_large" | "budget";
export class ListImagePolicyError extends Error {
  constructor(readonly reason: Exclude<ListImageFailure, "budget">) { super(reason); }
}
const invalid = (): never => { throw new ListImagePolicyError("unavailable"); };
function bounded(width: number, height: number) {
  if (!width || !height) invalid();
  if (width > LIST_IMAGE_MAX_DIMENSION || height > LIST_IMAGE_MAX_DIMENSION || width * height > LIST_IMAGE_MAX_PIXELS)
    throw new ListImagePolicyError("too_large");
  return { width, height };
}
/** Inspect BEFORE image decode/URL creation; fail closed for animation/unknown headers.
 * PNG: https://www.w3.org/TR/png-3/
 * WebP: https://developers.google.com/speed/webp/docs/riff_container
 * JPEG SOF0/1/2 mirrors the existing customer-export header reader.
 */
export function inspectListImage(bytes: Uint8Array, mime: string) {
  if (bytes.length > LIST_IMAGE_MAX_BYTES) throw new ListImagePolicyError("too_large");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length));
  if (mime === "image/png") {
    if (bytes.length < 45 || text(0, 8) !== "\x89PNG\r\n\x1a\n" || text(12, 4) !== "IHDR" || view.getUint32(8) !== 13) invalid();
    const dimensions = bounded(view.getUint32(16), view.getUint32(20));
    if (![1, 2, 4, 8].includes(bytes[24])) invalid();
    for (let at = 8; at + 12 <= bytes.length;) {
      const length = view.getUint32(at), kind = text(at + 4, 4);
      if (length > bytes.length - at - 12 || kind === "IHDR" && at !== 8 || ["acTL", "fcTL", "fdAT"].includes(kind)) invalid();
      if (kind === "IEND") { if (length || at + 12 !== bytes.length) invalid(); return dimensions; }
      at += length + 12;
    }
    return invalid();
  }
  if (mime === "image/jpeg") {
    if (bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) invalid();
    let dimensions: { width: number; height: number } | undefined;
    for (let at = 2; at + 2 < bytes.length;) {
      if (bytes[at++] !== 255) invalid();
      while (bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (marker === 0xda) { if (!dimensions) return invalid(); return dimensions; }
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
      if (at + 2 > bytes.length) invalid();
      const length = view.getUint16(at);
      if (length < 2 || at + length > bytes.length) invalid();
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (dimensions || length < 8 || bytes[at + 2] !== 8) invalid();
        dimensions = bounded(view.getUint16(at + 5), view.getUint16(at + 3));
      }
      at += length;
    }
    return invalid();
  }
  if (mime === "image/webp") {
    if (bytes.length < 25 || text(0, 4) !== "RIFF" || text(8, 4) !== "WEBP" || view.getUint32(4, true) + 8 !== bytes.length) invalid();
    let canvas: { width: number; height: number } | undefined, frame: typeof canvas;
    const u24 = (at: number) => bytes[at] + bytes[at + 1] * 256 + bytes[at + 2] * 65536;
    let at = 12;
    for (; at + 8 <= bytes.length;) {
      const kind = text(at, 4), length = view.getUint32(at + 4, true), data = at + 8;
      if (length > bytes.length - data || ["ANIM", "ANMF"].includes(kind)) invalid();
      if (kind === "VP8X") {
        if (canvas || at !== 12 || length !== 10 || bytes[data] & 2) invalid();
        canvas = bounded(u24(data + 4) + 1, u24(data + 7) + 1);
      } else if (kind === "VP8L") {
        if (frame || length < 5 || bytes[data] !== 0x2f) invalid();
        const bits = view.getUint32(data + 1, true);
        if (bits >>> 29) invalid();
        frame = bounded((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
      } else if (kind === "VP8 ") {
        if (frame || length < 10 || bytes[data] & 1 || text(data + 3, 3) !== "\x9d\x01\x2a") invalid();
        frame = bounded(view.getUint16(data + 6, true) & 0x3fff, view.getUint16(data + 8, true) & 0x3fff);
      }
      at = data + length + (length % 2);
      if (at > bytes.length) invalid();
    }
    if (at !== bytes.length || !frame || canvas && (canvas.width !== frame.width || canvas.height !== frame.height)) return invalid();
    return frame;
  }
  return invalid();
}
