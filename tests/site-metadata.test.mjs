import test from "node:test";
import assert from "node:assert/strict";
import {siteMetadata} from "../features/runtime/site-metadata.ts";
test("staging has absolute HTTPS images and cannot opt into indexing",()=>{
 const m=siteMetadata("https://staging.weaveops.top","production");assert.equal(m.image,"https://staging.weaveops.top/og.png");assert.equal(m.robots.index,false);
 assert.equal(siteMetadata("https://weaveops.top","production").robots.index,true);
});
test("unset origin omits fabricated images and defaults to noindex",()=>{
 const m=siteMetadata();assert.equal(m.image,undefined);assert.equal(m.base,undefined);assert.equal(m.robots.index,false);
});
test("invalid and credential-bearing public URLs are rejected without reflecting input",()=>{
 for(const url of ["http://localhost:3000","https://user:private@site.invalid","https://site.invalid/x","https://site.invalid/?token=private"]){assert.throws(()=>siteMetadata(url),error=>!error.message.includes("private"));}
});
