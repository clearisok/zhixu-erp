import test from "node:test";
import assert from "node:assert/strict";
import { retryThumbnail } from "../features/quote-center/server/thumbnail-retry.ts";
test("temporary thumbnail failure uses bounded backoff and then succeeds",async()=>{
 let attempts=0;const delays=[];const value=await retryThumbnail(async()=>{if(++attempts<3)throw {status:503};return "image";},new AbortController().signal,async ms=>{delays.push(ms);});
 assert.equal(value,"image");assert.deepEqual(delays,[500,1500]);assert.equal(attempts,3);
});
test("persistent 503 stops at three; authorization and invalid data are never retried",async()=>{
 for(const status of [503,401,403,404,400,0]){let attempts=0;await assert.rejects(retryThumbnail(async()=>{attempts++;throw Object.assign(Error("failed"),{status});},new AbortController().signal,async()=>{}));assert.equal(attempts,status===503?3:1);}
});
test("leaving the page cancels backoff before another read",async()=>{
 const c=new AbortController();let attempts=0;await assert.rejects(retryThumbnail(async()=>{attempts++;throw {status:503};},c.signal,async()=>{c.abort();}));assert.equal(attempts,1);
});
