import assert from "node:assert/strict";
import test from "node:test";
import { createNavigationModuleLoader } from "../components/foundation/navigation-module-loader.ts";

test("hover, focus and immediate click share one unfinished module load", async () => {
  let calls = 0;
  let finish;
  const load = createNavigationModuleLoader({ "/orders": () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  const hover = load("/orders"), focus = load("/orders"), click = load("/orders");
  assert.equal(hover, focus); assert.equal(focus, click);
  await Promise.resolve(); assert.equal(calls, 1);
  finish(); await click;
  await load("/orders"); assert.equal(calls, 1);
});

test("failed intent is contained and a later intent can retry", async () => {
  let calls = 0;
  const load = createNavigationModuleLoader({ "/quotes": () => { calls++; if (calls === 1) throw Error("offline"); return Promise.resolve(); } });
  await assert.doesNotReject(load("/quotes"));
  await load("/quotes"); assert.equal(calls, 2);
});

test("only exact allowlisted routes load code; neither URLs nor inherited properties are used", async () => {
  let calls = 0;
  const load = createNavigationModuleLoader({ "/quotes": async () => { calls++; } });
  for (const path of ["https://other.invalid/quotes", "/quotes?secret=1", "constructor", "__proto__", "/missing"]) await load(path);
  assert.equal(calls, 0);
});
