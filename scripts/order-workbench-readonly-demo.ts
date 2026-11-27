/** Local preview of the actual built UI, using authenticated existing GET APIs.
 * No server files/configuration, Source HTTP, schema or business writes. */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { serveStatic } from "../server/static-files.js";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i], value = process.argv[i + 1];
  if (!["--ssh", "--container", "--port", "--static", "--order-id"].includes(key) || !value || args.has(key)) throw Error("invalid_demo_arguments");
  args.set(key, value);
}
const host = args.get("--ssh"), container = args.get("--container");
const port = Number(args.get("--port") ?? "5177"), directory = resolve(args.get("--static") ?? "dist/client");
const orderId = args.get("--order-id");
if (!host || !container || !/^[a-zA-Z0-9][a-zA-Z0-9_.@-]*$/u.test(host) || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/u.test(container)
  || !Number.isInteger(port) || port < 1024 || port > 65535 || orderId && !/^[a-f0-9-]{36}$/u.test(orderId)) throw Error("explicit_demo_target_required");
const build = JSON.parse(await readFile(resolve(directory, "build-info.json"), "utf8"));
if (build.quoteAuthority !== "server" || build.identityMode !== "session" || build.orderRead !== "snapshot") throw Error("explicit_server_build_required");

// Credential and session values never leave the existing app container. The only
// POSTs are one normal login and logout; browser business writes are rejected.
const remoteProgram = `
const {createInterface}=require('node:readline');
(async()=>{
 const base='http://127.0.0.1:'+String(process.env.ZHIXU_SERVER_PORT||3000);
 const origin=(process.env.ZHIXU_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).find(Boolean);
 if(!origin||!process.env.ZHIXU_ADMIN_PASSWORD)throw Error('authentication_unavailable');
 const login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify({username:process.env.ZHIXU_ADMIN_USERNAME||'admin',password:process.env.ZHIXU_ADMIN_PASSWORD})});
 if(login.status!==200)throw Error('authentication_unavailable');
 const cookie=login.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw Error('authentication_unavailable');
 const emit=value=>process.stdout.write(JSON.stringify(value)+'\\n');
 emit({ready:true});
 try{for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
  let id;try{
   const request=JSON.parse(line);id=request.id;
   if(!Number.isSafeInteger(id)||typeof request.path!=='string'||request.path.length>4096||!request.path.startsWith('/api/v1/')||request.path.includes('\\\\'))throw Error('invalid_read');
   const url=new URL(request.path,base);if(url.origin!==new URL(base).origin||!url.pathname.startsWith('/api/v1/'))throw Error('invalid_read');
   const response=await fetch(url,{headers:{Cookie:cookie},redirect:'error',signal:AbortSignal.timeout(20000)});
   const limit=32*1024*1024,reader=response.body.getReader(),chunks=[];let length=0;
   for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>limit){await reader.cancel();throw Error('response_too_large');}chunks.push(part.value);}
   emit({id,status:response.status,type:response.headers.get('content-type'),body:Buffer.concat(chunks).toString('base64')});
  }catch{emit({id,status:502,type:'application/json',body:Buffer.from(JSON.stringify({error:{code:'demo_read_unavailable',message:'只读演示暂未取得数据'}})).toString('base64')});}
 }}finally{await fetch(base+'/api/v1/auth/logout',{method:'POST',headers:{Origin:origin,Cookie:cookie,'X-Zhixu-Request':'1'}}).catch(()=>{});}
})().catch(()=>{process.stdout.write(JSON.stringify({error:'demo_authentication_unavailable'})+'\\n');process.exitCode=1;});
`;
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
const bridge = spawn("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", host, `docker exec -i ${quote(container)} node -e ${quote(remoteProgram)}`], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
type Reply = { status: number; type: string; body: string };
let sequence = 0, stopped = false;
const pending = new Map<number, { resolve: (reply: Reply) => void; reject: () => void; timer: NodeJS.Timeout }>();
let readyResolve: () => void, readyReject: (error: Error) => void;
const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
const startup = setTimeout(() => readyReject(Error("demo_authentication_timeout")), 25000);
let stderrCategory = "ssh_bridge_unavailable";
bridge.stderr.on("data", bytes => {
  const text = String(bytes);
  if (/Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/iu.test(text)) stderrCategory = "ssh_host_identity_failed";
  else if (/Permission denied/iu.test(text)) stderrCategory = "ssh_permission_denied";
});
const lines = createInterface({ input: bridge.stdout, crlfDelay: Infinity });
lines.on("line", line => {
  try {
    const row = JSON.parse(line);
    if (row.ready === true) { clearTimeout(startup); readyResolve(); return; }
    if (row.error) { readyReject(Error("demo_authentication_unavailable")); return; }
    const job = pending.get(row.id);
    if (!job) return; clearTimeout(job.timer); pending.delete(row.id);
    if (!Number.isInteger(row.status) || row.status < 100 || row.status > 599 || typeof row.body !== "string" || row.body.length > 45 * 1024 * 1024) job.reject();
    else job.resolve({ status: row.status, type: row.type ?? "application/json", body: row.body });
  } catch { /* Unrecognized transport output is never printed. */ }
});
bridge.on("error", () => readyReject(Error("ssh_unavailable")));
bridge.on("close", () => {
  clearTimeout(startup); readyReject(Error(stderrCategory));
  for (const job of pending.values()) { clearTimeout(job.timer); job.reject(); } pending.clear();
});
function read(path: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const id = ++sequence, fail = () => reject(Error("demo_read_unavailable"));
    const timer = setTimeout(() => { pending.delete(id); fail(); }, 30000);
    pending.set(id, { resolve, reject: fail, timer }); bridge.stdin.write(JSON.stringify({ id, path }) + "\n");
  });
}
const origin = `http://127.0.0.1:${port}`;
const server = createServer(async (request, response) => {
  const fail = (status: number, code: string, message: string) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify({ error: { code, message } })); };
  if (request.headers.host !== `127.0.0.1:${port}` || request.headers["sec-fetch-site"] === "cross-site") return fail(403, "demo_loopback_required", "仅允许本机演示页面访问");
  if (!["GET", "HEAD"].includes(request.method ?? "")) return fail(403, "demo_read_only", "本地只读 Demo 不提交业务操作；原页面操作能力保留，等待评审后再使用正式环境");
  try {
    if (request.url?.startsWith("/api/v1/")) {
      const reply = await read(request.url); response.writeHead(reply.status, { "Content-Type": reply.type, "Cache-Control": "no-store", "X-WeaveOps-Demo": "readonly-authenticated-api" });
      response.end(request.method === "HEAD" ? undefined : Buffer.from(reply.body, "base64")); return;
    }
    if (request.url === "/__demo") { response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify({ mode: "READ_ONLY_LIVE_API", build, mutationsForwarded: 0, sourceCollection: false })); return; }
    if (request.url === "/" && orderId) { response.writeHead(302, { Location: `/order-center/server-detail?id=${orderId}` }); response.end(); return; }
    if (await serveStatic(request, response, directory)) return;
    fail(404, "demo_not_found", "页面不存在");
  } catch { fail(502, "demo_read_unavailable", "暂未取得真实接口数据，请检查只读连接"); }
});
const shutdown = () => { if (stopped) return; stopped = true; server.close(); bridge.stdin.end(); setTimeout(() => { bridge.kill(); process.exit(); }, 3000).unref(); };
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, shutdown);
try {
  await ready;
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  console.log(JSON.stringify({ mode: "READ_ONLY_LIVE_API", url: origin + (orderId ? `/order-center/server-detail?id=${orderId}` : "/order-center"), build, mutationsForwarded: 0, sourceCollection: false }));
} catch (error) { console.error(error instanceof Error ? error.message : "demo_unavailable"); shutdown(); process.exitCode = 1; }
