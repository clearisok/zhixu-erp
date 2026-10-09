import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createListImageLoader } from "../list-image-loader.ts";
import { syntheticPNG } from "./list-image-fixture.ts";
const png = syntheticPNG();
const bytes = new Blob([png], { type: "image/png" });
const image = { attachmentId: "synthetic-image", mimeType: "image/png", byteSize: bytes.size, sha256: createHash("sha256").update(png).digest("hex") };
const reference = { quoteId: "q", revisionId: "r", image };
const tick = () => new Promise(done => setTimeout(done, 30));
const until = async (read: () => boolean) => { for (let i=0;i<100;i++) { if(read())return;await tick(); } assert.fail("image completion timed out"); };
test("same relation deduplicates table/touch, validates hash, last subscriber revokes URL", async () => {
  let requests = 0; const revoked: string[] = []; const values: Array<string | null> = [];
  const loader = createListImageLoader({ download: async () => { requests++; return bytes; }, createURL: () => "blob:synthetic", revokeURL: url => revoked.push(url) });
  const a = loader.acquire(reference, v => values.push(v)), b = loader.acquire(reference, v => values.push(v));
  await until(()=>values.length===2); assert.equal(requests, 1); assert.deepEqual(values, ["blob:synthetic", "blob:synthetic"]);
  a(); assert.deepEqual(revoked, []); b(); assert.deepEqual(revoked, ["blob:synthetic"]); loader.dispose();
});
test("at most three active downloads; removal/logout aborts, never creates a late URL", async () => {
  const signals: AbortSignal[] = []; let urls = 0;
  const loader = createListImageLoader({ download: async (_q, _r, _id, signal) => { signals.push(signal!); await tick(); return bytes; }, createURL: () => { urls++; return "blob:synthetic"; } });
  for(let i=0;i<30;i++) loader.acquire({ ...reference, quoteId: String(i) }, () => {});
  assert.equal(signals.length,3); loader.dispose(); assert.ok(signals.every(s => s.aborted)); await tick(); assert.equal(urls,0); assert.equal(signals.length,3);
});
test("unavailable/invalid type/size/hash fails closed with no retry or URL", async () => {
  for(const blob of [new Blob(["changed!!"],{type:"image/png"}), new Blob(["synthetic"],{type:"text/plain"}), new Blob(["short"],{type:"image/png"})]) {
    let requests=0;const values: Array<string|null>=[];
    const loader=createListImageLoader({download:async()=>{requests++;return blob},createURL:()=>{assert.fail('Invalid image cannot become URL');}});
    loader.acquire(reference,v=>values.push(v));await tick();assert.deepEqual(values,[null]);assert.equal(requests,1);loader.dispose();
  }
});
