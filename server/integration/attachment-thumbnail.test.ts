import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import sharp from "sharp";
import { generateThumbnail, THUMBNAIL_MAX_SOURCE_BYTES } from "../attachments/thumbnail.js";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
export async function syntheticPhoneJPEG() {
  const bytes = Buffer.alloc(4032 * 3024 * 3);
  let n = 7;
  for (let i = 0; i < bytes.length; i++) { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; bytes[i] = n >>> 24; }
  return sharp(bytes, { raw: { width: 4032, height: 3024, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
}
test("real isolated decoder: common phone JPEG >2MiB yields tiny JPEG, source unmodified", async t => {
  const bytes = await syntheticPhoneJPEG(), before = sha(bytes);
  assert.ok(bytes.length > 2 * 1024 * 1024);
  const output = await generateThumbnail({ size: bytes.length, sha256: before }, async () => Readable.from(bytes));
  const metadata = await sharp(output.bytes).metadata();
  assert.equal(metadata.width, 256); assert.equal(metadata.height, 192);
  assert.ok(output.bytes.length < 96 * 1024 && output.bytes.length < bytes.length / 100);
  assert.equal(sha(bytes), before); assert.equal(sha(output.bytes), output.sha256);
  t.diagnostic(JSON.stringify({ source: bytes.length, sourceSHA: before, width: metadata.width, height: metadata.height, thumbnail: output.bytes.length }));
});
test("PNG/WebP, EXIF orientation, transparency, aspect and no enlargement", async () => {
  for (const format of ["png", "webp", "jpeg"] as const) {
    const source = await sharp({ create: { width: 600, height: 300, channels: 4, background: "#39705e88" } })
      .withMetadata({ orientation: 6 }).toFormat(format).toBuffer();
    const result = await generateThumbnail({ size: source.length, sha256: sha(source) }, async () => Readable.from(source));
    const metadata = await sharp(result.bytes).metadata();
    assert.deepEqual([metadata.width, metadata.height], [128, 256]);
    assert.equal(metadata.orientation, undefined);
  }
});
test("source hash/size, damaged image, unsupported format and decode bomb fail closed", async () => {
  const valid = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).png().toBuffer();
  for (const [bytes, size, hash] of [[valid, valid.length, "0".repeat(64)], [valid, valid.length - 1, sha(valid)], [Buffer.from("bad"), 3, sha(Buffer.from("bad"))]] as const)
    await assert.rejects(() => generateThumbnail({ size, sha256: hash }, async () => Readable.from(bytes)), /Thumbnail unavailable/);
  let opened = false;
  await assert.rejects(() => generateThumbnail({ size: THUMBNAIL_MAX_SOURCE_BYTES + 1, sha256: sha(valid) }, async () => { opened = true; return Readable.from(valid); }));
  assert.equal(opened, false);
  // Header only, no multi-GB fixture. Decoder refuses limit before allocating pixels.
  const bomb = Buffer.from(valid); bomb.writeUInt32BE(100_000, 16); bomb.writeUInt32BE(100_000, 20);
  await assert.rejects(() => generateThumbnail({ size: bomb.length, sha256: sha(bomb) }, async () => Readable.from(bomb)));
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>');
  await assert.rejects(() => generateThumbnail({ size: svg.length, sha256: sha(svg) }, async () => Readable.from(svg)));
});
test("admission globally bounds original reads and queued aborts; disconnect destroys streams", async () => {
  const controllers = Array.from({ length: 6 }, () => new AbortController());
  let opened = 0, destroyed = 0;
  const jobs = controllers.map(controller => generateThumbnail({ size: 1, sha256: "0".repeat(64) }, async () => {
    opened++;
    const stream = new Readable({ read() {}, destroy(_error, done) { destroyed++; done(); } });
    return stream;
  }, controller.signal).catch(() => "cancelled"));
  await new Promise(done => setTimeout(done, 50)); assert.equal(opened, 2);
  for (const controller of controllers.slice(2)) controller.abort();
  controllers[0].abort(); controllers[1].abort();
  assert.deepEqual(await Promise.all(jobs), Array(6).fill("cancelled"));
  assert.equal(opened, 2); assert.equal(destroyed, 2);
});
