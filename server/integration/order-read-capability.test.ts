import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp,writeFile,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseOrderRead } from "../../features/order-center/server/read-capability.js";
import { isEnabledServerRoute } from "../../features/quote-center/authority/quote-authority.js";
import { assertRuntimeBuildIdentity } from "../build-identity.js";
test("order read defaults off and allows only the four proven pages with explicit snapshot",()=>{
 const prior=process.env.NEXT_PUBLIC_ZHIXU_ORDER_READ;
 try{
  delete process.env.NEXT_PUBLIC_ZHIXU_ORDER_READ;assert.equal(parseOrderRead(),"disabled");assert.throws(()=>parseOrderRead("true"));
  for(const p of ["/order-center","/order-center/server-detail","/order-center/style-progress/detail","/system-settings/progress-settings"])assert.equal(isEnabledServerRoute(p),false);
  process.env.NEXT_PUBLIC_ZHIXU_ORDER_READ="snapshot";
  for(const p of ["/order-center","/order-center/server-detail","/order-center/style-progress/detail","/system-settings/progress-settings"])assert.equal(isEnabledServerRoute(p),true);
  for(const p of ["/order-center/new","/order-center/detail","/order-center/style-progress","/order-center/risks","/order-center/server-preview","/production-scheduling","/closing-center"])assert.equal(isEnabledServerRoute(p),false);
 }finally{if(prior===undefined)delete process.env.NEXT_PUBLIC_ZHIXU_ORDER_READ;else process.env.NEXT_PUBLIC_ZHIXU_ORDER_READ=prior;}
});
test("compiled source pages require matching runtime and snapshot reader before server startup",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"zhixu-order-build-"));
 const info={gitCommit:"synthetic",buildId:"synthetic",buildTime:"synthetic",masterSettingsAuthority:"server",identityMode:"session",quoteWriterMode:"writable",quoteAuthority:"server",orderRead:"snapshot"};
 const env={ZHIXU_GIT_COMMIT:info.gitCommit,ZHIXU_BUILD_ID:info.buildId,ZHIXU_BUILD_TIME:info.buildTime,NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY:"server",ZHIXU_IDENTITY_MODE:"session",NEXT_PUBLIC_ZHIXU_QUOTE_WRITER_MODE:"writable",NEXT_PUBLIC_ZHIXU_QUOTE_AUTHORITY:"server",NEXT_PUBLIC_ZHIXU_ORDER_READ:"snapshot",ZHIXU_AINUOKE_SOURCE_READ:"snapshot"};
 try{
  await writeFile(join(directory,"build-info.json"),JSON.stringify(info));await assertRuntimeBuildIdentity(directory,undefined,env);
  await assert.rejects(assertRuntimeBuildIdentity(directory,undefined,{...env,NEXT_PUBLIC_ZHIXU_ORDER_READ:"disabled"}),/order_read_mismatch/);
  await assert.rejects(assertRuntimeBuildIdentity(directory,undefined,{...env,ZHIXU_AINUOKE_SOURCE_READ:"disabled"}),/order_read_source_required/);
  await writeFile(join(directory,"build-info.json"),JSON.stringify({...info,identityMode:"local-single-user"}));
  await assert.rejects(assertRuntimeBuildIdentity(directory,undefined,{...env,ZHIXU_IDENTITY_MODE:"local-single-user"}),/order_read_source_required/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
