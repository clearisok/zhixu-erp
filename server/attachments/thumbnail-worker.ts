import sharp from "sharp";

// Disposable decoder process: no network/storage/credentials, no retained native cache.
sharp.cache(false);
sharp.concurrency(1);
const chunks: Buffer[] = [];
let length = 0;
const watchdog = setInterval(() => {
  if (process.memoryUsage().rss > 256 * 1024 * 1024) process.exit(1);
}, 25);
try {
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > 32 * 1024 * 1024) throw new Error("bounded input");
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  chunks.length = 0;
  const format = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "jpeg"
    : bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "png"
    : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" ? "webp" : null;
  if (!format) throw new Error("unsupported header");
  const options = { limitInputPixels: 24_000_000, sequentialRead: true, failOn: "warning" as const };
  const metadata = await sharp(bytes, options).metadata();
  if (metadata.format !== format || (metadata.pages ?? 1) !== 1
      || !metadata.width || !metadata.height || metadata.width > 12_000 || metadata.height > 12_000)
    throw new Error("bounded decoder");
  const { data, info } = await sharp(bytes, options).autoOrient()
    .resize(256, 256, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }).jpeg({ quality: 75, progressive: false }).toBuffer({ resolveWithObject: true });
  if (!info.width || !info.height || info.width > 256 || info.height > 256 || data.length > 96 * 1024)
    throw new Error("bounded output");
  process.stdout.write(data);
} catch { process.exitCode = 1; } // Never emit decoder/raw source errors.
finally { clearInterval(watchdog); }
