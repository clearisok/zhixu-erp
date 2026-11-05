import assert from "node:assert/strict";
import test from "node:test";
import { createSessionReadCache } from "../features/server-auth/session-read-cache.ts";

test("anonymous reads bypass cache; scoped parallel reads dedupe with isolated copies and TTL", async () => {
  let time=0,calls=0; const cache=createSessionReadCache(()=>time);
  const load=async()=>({n:++calls});
  await cache.read("x",load,120000);await cache.read("x",load,120000);assert.equal(calls,2);
  cache.setScope("user:permissions");
  const [a,b]=await Promise.all([cache.read("x",load,120000),cache.read("x",load,120000)]);
  assert.equal(calls,3);a.n=99;assert.equal(b.n,3);
  await cache.read("x",load,120000);assert.equal(calls,3);
  time=120001;await cache.read("x",load,120000);assert.equal(calls,4);
});
test("identity change and mutation invalidation reject late reads, failures are not cached", async()=>{
  const cache=createSessionReadCache();cache.setScope("a");let finish;
  const old=cache.read("x",()=>new Promise(r=>{finish=r;}),120000);
  await Promise.resolve();cache.setScope("b");finish({secret:"old"});await assert.rejects(old,/scope changed/);
  let calls=0;const load=async()=>{calls++;throw Error("offline");};
  await assert.rejects(cache.read("x",load,120000));await assert.rejects(cache.read("x",load,120000));assert.equal(calls,2);
  const pending=cache.read("y",async()=>1,120000);cache.clear();await assert.rejects(pending,/scope changed/);
});
test("navigation result is consumed once, then re-read; abandoned preload expires",async()=>{
  let time=0,calls=0;const cache=createSessionReadCache(()=>time);cache.setScope("a");const load=async()=>++calls;
  await cache.preload("x",load);assert.equal(await cache.read("x",load),1);
  assert.equal(await cache.read("x",load),2);
  await cache.preload("x",load);time=5001;assert.equal(await cache.read("x",load),4);
});
test("authorization failures clear other cached reads",async()=>{
  const cache=createSessionReadCache();cache.setScope("a");let calls=0;const load=async()=>++calls;
  await cache.read("x",load,120000);
  await assert.rejects(cache.read("denied",async()=>{throw Object.assign(Error("denied"),{status:403});}));
  await cache.read("x",load,120000);assert.equal(calls,2);
});
