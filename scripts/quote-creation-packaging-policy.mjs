import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const publishedImage = "sha256:c3c2e346eb2cafdd8765398d29a12414f41d5ad66d2f68e906ed246fb4cd8d93";
export const publishedSource = "d2a3509f3973980a2016e1f46760cf3664bd2d77";
export const attachmentMigration = "0008_quote_attachments.sql";
export const receiptMigration = "0010_quote_creation_receipts.sql";
export const publishedAttachmentHash = "f205f3ed1fb737813fdac3b36d7a043c7e25759db217738fbc3606c0b121cf6a";
export const reviewedReceiptHash = "5e43601397fce0fdd1b591a4851cf8b6c6c3b40681cd10a6a816798b51a0064f";
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
// CRLF/LF only: do not trim SQL, whitespace, BOM, comments or lone CR.
export const logicalBytes = bytes => Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n"));

export function verifyPackaging(source, published, committed = source) {
  const names = Object.keys(source).sort();
  assert.equal(names.length, 10, "exact_ten_source_migrations_required");
  names.forEach((name, index) => assert.match(name, new RegExp(`^${String(index + 1).padStart(4, "0")}_[a-z0-9_]+\\.sql$`, "u")));
  assert.deepEqual(Object.keys(committed).sort(), names, "committed_migrations_required");
  assert.deepEqual(Object.keys(published).sort(), names.slice(0, 9), "exact_nine_published_migrations_required");
  assert.equal(sha256(published[attachmentMigration]), publishedAttachmentHash, "published_0008_identity_mismatch");
  assert.equal(sha256(source[receiptMigration]), reviewedReceiptHash, "reviewed_0010_bytes_changed");
  assert.equal(sha256(committed[receiptMigration]), reviewedReceiptHash, "committed_0010_bytes_changed");
  const expected = {};
  for (const name of names) {
    assert.ok(logicalBytes(source[name]).equals(logicalBytes(committed[name])), `checkout_semantic_drift:${name}`);
    if (published[name]) {
      assert.ok(logicalBytes(source[name]).equals(logicalBytes(published[name])), `published_semantic_drift:${name}`);
      if (name !== attachmentMigration) assert.ok(source[name].equals(published[name]), `unexpected_raw_byte_difference:${name}`);
    }
    expected[name] = sha256(name === attachmentMigration ? published[name] : source[name]);
  }
  return expected;
}
