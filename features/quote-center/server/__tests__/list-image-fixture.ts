import { deflateSync } from "node:zlib";
export function syntheticPNG(width = 96, height = 48, padding = 0, headerOnly = false) {
  const chunk = (kind: string, data: Buffer) => {
    const buffer = Buffer.alloc(data.length + 12); buffer.writeUInt32BE(data.length); buffer.write(kind, 4); data.copy(buffer, 8);
    let crc = 0xffffffff;
    for (const byte of buffer.subarray(4, buffer.length - 4)) {
      crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    buffer.writeUInt32BE((crc ^ 0xffffffff) >>> 0, buffer.length - 4); return buffer;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const raw = headerOnly ? Buffer.alloc(1) : Buffer.alloc((width * 3 + 1) * height);
  if (!headerOnly) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = y * (width * 3 + 1) + 1 + x * 3; raw[at] = x % 256; raw[at + 1] = y % 256; raw[at + 2] = 128;
  }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), ...(padding ? [chunk("tEXt", Buffer.alloc(padding))] : []), chunk("IEND", Buffer.alloc(0))]);
}
