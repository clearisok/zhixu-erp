import { pathToFileURL } from "node:url";
import { SourceError } from "./contract.js";

/** Pure plan validation, not a launcher and not authorization to initialize any database. */
export function localDemoPlan(input: { instance: string; sourceSha: string; imageDigest: string; port: number }) {
  if (!/^local-demo-[a-z0-9]{8}$/u.test(input.instance) || !/^[a-f0-9]{40}$/u.test(input.sourceSha)
    || !/^sha256:[a-f0-9]{64}$/u.test(input.imageDigest)
    || !Number.isSafeInteger(input.port) || input.port < 62000 || input.port > 63999)
    throw new SourceError("isolated_demo_plan_invalid");
  return { schemaVersion: "zhixu-isolated-demo-plan.v1", mode: "plan-only", databaseAccess: "none", sourceActivation: "not-activated",
    project: "zhixu-" + input.instance, sourceSha: input.sourceSha, imageDigest: input.imageDigest,
    web: { bindAddress: "127.0.0.1", port: input.port, origin: "http://127.0.0.1:" + input.port },
    database: { databaseName: "zhixu_" + input.instance.replaceAll("-", "_"), network: "zhixu-" + input.instance + "-backend",
      volume: "zhixu-" + input.instance + "-postgres", publishedPorts: [], existingConnectionAllowed: false },
    authority: { quote: "server", masterSettings: "server", writer: "writable", identity: "session", orderRead: "snapshot", sourceRead: "snapshot" },
    existingEnvironmentAccess: false, realTeamAccountsAllowed: false, productionRoutesEnabled: false,
    credentials: "private-operator-input-to-anonymous-stdin-then-linux-owner-only-tmpfs-config",
    shutdown: "stop-owned-services-and-preserve-volume-no-automatic-expiry-or-deletion",
    nextGate: "verify-port-and-resource-absence-and-image-build-metadata-then-obtain-exact-target-authorization" };
}

export function parseDemoPlanArguments(args: string[]) {
  if (args.length !== 5 || !args.includes("--plan")) throw new SourceError("isolated_demo_plan_invalid");
  const values = new Map<string,string>();
  for (const arg of args.filter(a => a !== "--plan")) {
    const m = /^--(instance|source-sha|image-digest|port)=(.+)$/u.exec(arg);
    if (!m || values.has(m[1])) throw new SourceError("isolated_demo_plan_invalid");
    values.set(m[1],m[2]);
  }
  if (values.size !== 4 || !/^[0-9]{5}$/u.test(values.get("port") ?? "")) throw new SourceError("isolated_demo_plan_invalid");
  return { instance: values.get("instance")!, sourceSha: values.get("source-sha")!, imageDigest: values.get("image-digest")!, port: Number(values.get("port")) };
}
export function main(args = process.argv.slice(2)) { process.stdout.write(JSON.stringify(localDemoPlan(parseDemoPlanArguments(args))) + "\n"); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  try { main(); } catch { process.stdout.write('{"result":"FAIL","code":"isolated_demo_plan_invalid","databaseAccess":"none"}\n'); process.exitCode = 1; }
