import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { attachmentMigration, receiptMigration, verifyPackaging, logicalBytes } from "../quote-creation-packaging-policy.mjs";

// Synthetic baseline derived from committed SQL; no Docker, credentials or DB.
const source = Object.fromEntries(readdirSync("database/migrations").filter(n => n.endsWith(".sql")).map(n => [n, readFileSync("database/migrations/" + n)]));
const committed = Object.fromEntries(Object.keys(source).map(n => [n, execFileSync("git", ["show", "HEAD:database/migrations/" + n])]));
const published = Object.fromEntries(Object.entries(source).filter(([n]) => n !== receiptMigration));
published[attachmentMigration] = logicalBytes(source[attachmentMigration]);
test("only published 0008 LF bytes restored; other files including 0010 unchanged", () => {
  const hashes = verifyPackaging(source, published, committed);
  assert.equal(hashes[attachmentMigration], "f205f3ed1fb737813fdac3b36d7a043c7e25759db217738fbc3606c0b121cf6a");
  assert.equal(hashes[receiptMigration], "5e43601397fce0fdd1b591a4851cf8b6c6c3b40681cd10a6a816798b51a0064f");
});
test("published identity drift rejected", () => assert.throws(() => verifyPackaging(source, { ...published, [attachmentMigration]: Buffer.from("SELECT 1;\n") }), /published_0008_identity_mismatch/u));
test("0008 semantic drift rejected even with correct published checksum", () => assert.throws(() => verifyPackaging({ ...source, [attachmentMigration]: Buffer.concat([source[attachmentMigration], Buffer.from("-- changed\n")]) }, published), /published_semantic_drift/u));
test("other migration raw-byte mismatch rejected", () => {
  const name = Object.keys(published)[0];
  assert.throws(() => verifyPackaging(source, { ...published, [name]: logicalBytes(source[name]) }), /unexpected_raw_byte_difference/u);
});
test("unreviewed 0010 rejected", () => assert.throws(() => verifyPackaging({ ...source, [receiptMigration]: Buffer.concat([source[receiptMigration], Buffer.from("\r\n")]) }, published), /reviewed_0010_bytes_changed/u));
test("committed 0010 drift rejected", () => assert.throws(() => verifyPackaging(source, published, { ...committed, [receiptMigration]: Buffer.from("SELECT 1;") }), /committed_0010_bytes_changed/u));
test("checkout semantic drift rejected", () => {
  const name = Object.keys(source)[0];
  assert.throws(() => verifyPackaging(source, published, { ...committed, [name]: Buffer.from("SELECT 1;") }), /checkout_semantic_drift/u);
});
test("missing published migration rejected", () => {
  const partial = { ...published }; delete partial[attachmentMigration];
  assert.throws(() => verifyPackaging(source, partial), /exact_nine_published_migrations_required/u);
});
test("extra source migration rejected", () => assert.throws(() => verifyPackaging({ ...source, "0011_extra.sql": Buffer.from("SELECT 1;") }, published), /exact_ten_source_migrations_required/u));
test("lone CR, whitespace and BOM are not normalised away", () => {
  assert.ok(!logicalBytes(Buffer.from("a\rb")).equals(logicalBytes(Buffer.from("a\nb"))));
  assert.ok(!logicalBytes(Buffer.from(" a\n")).equals(logicalBytes(Buffer.from("a\n"))));
  assert.ok(!logicalBytes(Buffer.from("\ufeffa\n")).equals(logicalBytes(Buffer.from("a\n"))));
});
for (const args of [["arbitrary-image"], ["zhixu-quote-two-step:test", "--ignore-checksum"]]) {
  test(`candidate verifier rejects unsupported input before Docker, no success: ${args.join(" ")}`, () => {
    const result = spawnSync(process.execPath, ["scripts/verify-quote-creation-candidate.mjs", ...args], { encoding: "utf8" });
    assert.notEqual(result.status, 0); assert.equal(result.stdout, "");
  });
}
