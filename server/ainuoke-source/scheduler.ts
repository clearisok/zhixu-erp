import { setTimeout as delay } from "node:timers/promises";
import { SourceError } from "./contract.js";
export type SchedulePolicy = {intervalMs:number;maxBackoffMs:number};
export function schedulePolicy(intervalMs=300000,maxBackoffMs=1800000):SchedulePolicy {
  if(!Number.isSafeInteger(intervalMs)||intervalMs<60000||intervalMs>3600000||!Number.isSafeInteger(maxBackoffMs)||maxBackoffMs<intervalMs||maxBackoffMs>86400000)throw new SourceError("invalid_schedule_policy");
  return {intervalMs,maxBackoffMs};
}
const terminal = new Set(["invalid_credential","auth_expired","source_account_mismatch","source_actor_unavailable","source_no_bound_orders","permission_denied","forbidden"]);
export type ScheduleEvent={state:"captured"|"retrying"|"stopped";failures:number;nextDelayMs:number;code?:string};
/** One completed attempt then a delay: no overlap or catch-up storm; stop never interrupts publication. */
export async function runSchedule(options:{
  capture:()=>Promise<unknown>;signal:AbortSignal;policy:SchedulePolicy;
  emit:(event:ScheduleEvent)=>void;wait?:(ms:number,signal:AbortSignal)=>Promise<void>;
}) {
  const policy=schedulePolicy(options.policy.intervalMs,options.policy.maxBackoffMs);
  const wait=options.wait??((ms,signal)=>delay(ms,undefined,{signal}));
  let failures=0;
  while(!options.signal.aborted) {
    let next=policy.intervalMs;
    try {await options.capture();failures=0;options.emit({state:"captured",failures,nextDelayMs:next});}
    catch(error) {
      failures++;
      const code=error instanceof SourceError?error.code:"source_capture_failed";
      if(terminal.has(code)){options.emit({state:"stopped",failures,nextDelayMs:0,code});throw new SourceError(code);}
      next=Math.min(policy.maxBackoffMs,policy.intervalMs*2**Math.min(failures,16));
      options.emit({state:"retrying",failures,nextDelayMs:next,code});
    }
    if(options.signal.aborted)break;
    try {await wait(next,options.signal);}catch(error){if(!options.signal.aborted)throw error;}
  }
}
