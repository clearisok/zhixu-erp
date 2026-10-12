import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { startContinuousFixture } from "../server/integration/ainuoke-continuous-fixture.js";
import { runSchedule,schedulePolicy } from "../server/ainuoke-source/scheduler.js";
const build=JSON.parse(readFileSync("dist/client/build-info.json","utf8"));
if(build.quoteAuthority!=="server"||build.identityMode!=="session"||build.orderRead!=="snapshot")throw Error("Build the explicit Server snapshot candidate first; see AINUOKE_SERVER_SOURCE.md.");
const fixture=await startContinuousFixture(resolve("dist/client"));
const stop=new AbortController();const cancel=()=>stop.abort();
process.once("SIGINT",cancel);process.once("SIGTERM",cancel);
const expiry=setTimeout(cancel,2*60*60*1000);
console.log(JSON.stringify({result:"SYNTHETIC_LOCAL_DEMO",url:fixture.base+"/order-center",users:fixture.users,password:fixture.password,container:fixture.containerName,source:"generated; no real Ainuoke connection",expiresAfterMinutes:120}));
try{await runSchedule({signal:stop.signal,policy:schedulePolicy(60000,240000),capture:fixture.capture,emit:e=>console.log(JSON.stringify({synthetic:true,...e}))});}
finally{clearTimeout(expiry);await fixture.close();}
