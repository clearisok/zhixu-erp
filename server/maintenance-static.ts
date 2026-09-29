import { createServer } from "node:http";
import { resolve } from "node:path";
import { assertRuntimeBuildIdentity } from "./build-identity.js";
import { assertMaintenanceEnvironment, createMaintenanceStaticApp } from "./maintenance-static-app.js";

assertMaintenanceEnvironment();
const staticDirectory = resolve("dist/client");
await assertRuntimeBuildIdentity(staticDirectory, "frozen");
const port = Number(process.env.ZHIXU_MAINTENANCE_PORT ?? "3000");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("maintenance_port_invalid");

createServer(createMaintenanceStaticApp(staticDirectory)).listen(port, "0.0.0.0", () => {
  process.stdout.write(`${JSON.stringify({ event: "maintenance_static_listening", port, authority: "frozen" })}\n`);
});
