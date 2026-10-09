import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { createListImageLoader } from "../list-image-loader.ts";
import { inspectListImage, LIST_IMAGE_MAX_BYTES, LIST_IMAGE_MAX_PIXELS } from "../list-image-policy.ts";
import { createQuoteAttachmentClient } from "../quote-attachment-client.ts";
import { syntheticPNG } from "./list-image-fixture.ts";

const png = syntheticPNG(), blob = new Blob([png], { type: "image/png" });
const reference = { quoteId: "q", revisionId: "r", image: { attachmentId: "i", mimeType: "image/png", byteSize: blob.size, sha256: createHash("sha256").update(png).digest("hex") } };
const tick = () => new Promise(done => setTimeout(done, 50));
const until = async (read: () => boolean) => { for(let i=0;i<50;i++) {if(read())return;await tick();}assert.fail("resource completion timed out");};

test("list rejects oversized metadata before any original download (no large allocation)", () => {
  let downloads = 0;
  const loader = createListImageLoader({ download: async () => { downloads++; return new Blob(); } });
  const results: Array<string | null> = [];
  loader.acquire({ quoteId: "q", revisionId: "r", image: { attachmentId: "large", mimeType: "image/png", byteSize: 100 * 1024 * 1024, sha256: "0".repeat(64) } }, url => results.push(url));
  assert.equal(downloads, 0);
  assert.deepEqual(results, [null]);
  loader.dispose();
});

test("exact encoded limit accepted, limit+1 rejected; no GB fixture", async () => {
  const exact = syntheticPNG(96,48,LIST_IMAGE_MAX_BYTES-png.length-12);
  assert.equal(exact.length,LIST_IMAGE_MAX_BYTES);
  assert.deepEqual(inspectListImage(exact,"image/png"),{width:96,height:48});
  const large = new Uint8Array(LIST_IMAGE_MAX_BYTES+1);
  assert.throws(()=>inspectListImage(large,"image/png"),/too_large/);
  let accepted = false;
  const loader=createListImageLoader({download:async()=>new Blob([exact],{type:"image/png"}),createURL:()=>{accepted=true;return "blob:exact";}});
  loader.acquire({...reference,image:{...reference.image,byteSize:exact.length,sha256:createHash("sha256").update(exact).digest("hex")}},()=>{});
  await until(()=>accepted);assert.equal(accepted,true);loader.dispose();
});

test("pixel/dimension limit and animated PNG reject before URL/decode",async()=>{
  assert.deepEqual(inspectListImage(syntheticPNG(1024,1024,0,true),"image/png"),{width:1024,height:1024});
  assert.equal(LIST_IMAGE_MAX_PIXELS,1024*1024);
  for(const bytes of [syntheticPNG(1024,1025,0,true),syntheticPNG(4097,1,0,true)]) {
    let created=false;const results: Array<string|undefined>=[];
    const loader=createListImageLoader({download:async()=>new Blob([bytes],{type:"image/png"}),createURL:()=>{created=true;return "blob:forbidden"}});
    loader.acquire({...reference,image:{...reference.image,byteSize:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")}},(_url,reason)=>results.push(reason));
    await until(()=>results.length>0);assert.equal(created,false);assert.deepEqual(results,["too_large"]);loader.dispose();
  }
  const animation = Buffer.from(png);animation.write("acTL",37);
  assert.throws(()=>inspectListImage(animation,"image/png"),/unavailable/);
  const sixteenBit=Buffer.from(png);sixteenBit[24]=16;
  assert.throws(()=>inspectListImage(sixteenBit,"image/png"),/unavailable/);
});

test("bounded WebP/JPEG header inspection, canvas mismatch/animation/truncation rejected",()=>{
  const webp=(kind:string,data:Buffer)=>{const b=Buffer.alloc(20+data.length+data.length%2);b.write("RIFF");b.writeUInt32LE(b.length-8,4);b.write("WEBP",8);b.write(kind,12);b.writeUInt32LE(data.length,16);data.copy(b,20);return b;};
  const lossless=Buffer.alloc(5);lossless[0]=0x2f;lossless.writeUInt32LE(95|(47<<14),1);
  assert.deepEqual(inspectListImage(webp("VP8L",lossless),"image/webp"),{width:96,height:48});
  const lossy=Buffer.alloc(10);lossy.set([0x9d,1,0x2a],3);lossy.writeUInt16LE(96,6);lossy.writeUInt16LE(48,8);
  assert.deepEqual(inspectListImage(webp("VP8 ",lossy),"image/webp"),{width:96,height:48});
  const extended=webp("VP8X",Buffer.alloc(10));extended[20]=2;
  assert.throws(()=>inspectListImage(extended,"image/webp"),/unavailable/);
  const combined=Buffer.concat([webp("VP8X",Buffer.alloc(10)),webp("VP8L",lossless).subarray(12)]);combined.writeUInt32LE(combined.length-8,4);
  assert.throws(()=>inspectListImage(combined,"image/webp"),/unavailable/);
  assert.throws(()=>inspectListImage(png.subarray(0,20),"image/png"),/unavailable/);
  const jpeg=Buffer.from([255,216,255,192,0,11,8,0,48,0,96,1,1,17,0,255,218,0,2,255,217]);
  assert.deepEqual(inspectListImage(jpeg,"image/jpeg"),{width:96,height:48});
  const huge=Buffer.from(jpeg);huge.writeUInt16BE(4097,9);assert.throws(()=>inspectListImage(huge,"image/jpeg"),/too_large/);
});

test("four MAX-pixel resident resources across many rows; release wakes budget waiters",async()=>{
  let serial=0;const live=new Set<string>(),releases:Array<()=>void>=[];
  const maxPixels=syntheticPNG(1024,1024),maxBlob=new Blob([maxPixels],{type:"image/png"});
  const loader=createListImageLoader({download:async()=>maxBlob,createURL:()=>{const url=`blob:${++serial}`;live.add(url);assert.ok(live.size<=4);return url},revokeURL:url=>live.delete(url)});
  for(let i=0;i<12;i++)releases.push(loader.acquire({...reference,quoteId:String(i),image:{...reference.image,byteSize:maxBlob.size,sha256:createHash("sha256").update(maxPixels).digest("hex")}},()=>{}));
  await until(()=>live.size===4);assert.equal(serial,4);
  releases[0]();await until(()=>serial===5);assert.equal(live.size,4);
  loader.dispose();assert.equal(live.size,0);
});

test("actual encoded byte budget bounds small-pixel padded images independently",async()=>{
  const padded=syntheticPNG(96,48,LIST_IMAGE_MAX_BYTES-png.length-12),paddedBlob=new Blob([padded],{type:"image/png"});
  const live=new Set<string>();let count=0;
  const loader=createListImageLoader({download:async()=>paddedBlob,createURL:()=>{const url=`blob:bytes-${++count}`;live.add(url);assert.ok(live.size<=4);return url},revokeURL:url=>live.delete(url)});
  for(let i=0;i<8;i++)loader.acquire({...reference,quoteId:String(i),image:{...reference.image,byteSize:padded.length,sha256:createHash("sha256").update(padded).digest("hex")}},()=>{});
  await until(()=>count===4);assert.equal(live.size,4);loader.dispose();assert.equal(live.size,0);
});

test("leave/re-enter with a late ignored abort never revokes/deletes a newer same-key lease",async()=>{
  const finishes:Array<(b:Blob)=>void>=[],signals:AbortSignal[]=[],urls:string[]=[],revoked:string[]=[];
  const loader=createListImageLoader({download:async(_q,_r,_id,signal)=>{signals.push(signal!);return new Promise<Blob>(done=>finishes.push(done));},createURL:()=>{const url=`blob:${urls.length}`;urls.push(url);return url},revokeURL:url=>revoked.push(url)});
  const first=loader.acquire(reference,()=>{});first();assert.equal(signals[0].aborted,true);
  const received:Array<string|null>=[];const second=loader.acquire(reference,url=>received.push(url));
  finishes[0](blob);await tick();assert.deepEqual(urls,[]);
  finishes[1](blob);await until(()=>received.length===1);assert.deepEqual(received,["blob:0"]);
  const duplicate=loader.acquire(reference,()=>{});second();assert.deepEqual(revoked,[]);
  duplicate();assert.deepEqual(revoked,["blob:0"]);loader.dispose();
});

test("fast-scroll ignored aborts retain slots until work settles; identity disposal clears all",async()=>{
  const finishes:Array<(b:Blob)=>void>=[];let downloads=0,urls=0;
  const loader=createListImageLoader({download:async()=>{downloads++;return new Promise<Blob>(done=>finishes.push(done));},createURL:()=>{urls++;return "blob:never"}});
  for(let i=0;i<40;i++)loader.acquire({...reference,quoteId:String(i)},()=>{})();
  assert.equal(downloads,3);
  loader.dispose();for(const finish of finishes)finish(blob);await tick();assert.equal(urls,0);assert.equal(downloads,3);
  const replacement=createListImageLoader({scope:"new-user",download:async()=>blob,createURL:()=>"blob:new"});
  const values:Array<string|null>=[];replacement.acquire(reference,url=>values.push(url));await until(()=>values.length===1);assert.deepEqual(values,["blob:new"]);replacement.dispose();
});

test("bounded stream cancels dishonest/missing Content-Length; default download unchanged",async()=>{
  for(const length of ["9",null]) {
    let cancelled=false,reads=0;
    const client=createQuoteAttachmentClient({fetchImpl:async()=>new Response(new ReadableStream({pull(controller){reads++;controller.enqueue(new Uint8Array(5));},cancel(){cancelled=true;}}),{headers:{"content-type":"image/png",...(length?{"content-length":length}:{})}})});
    await assert.rejects(()=>client.download("q","r","i",undefined,8));
    assert.equal(cancelled,true);assert.ok(reads<=3);
  }
  const client=createQuoteAttachmentClient({fetchImpl:async()=>new Response(png,{headers:{"content-type":"image/png"}})});
  assert.equal((await client.download("q","r","i",undefined,png.length)).size,png.length);
  assert.equal((await client.download("q","r","i")).size,png.length);
});
