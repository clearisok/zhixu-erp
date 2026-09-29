import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { serveStatic } from "./static-files.js";

const forbiddenEnvironment = /^(?:DB_|DATABASE_URL$|POSTGRES_|PGHOST$|PGPORT$|PGDATABASE$|PGUSER$|PGPASSWORD$|ZHIXU_ADMIN_PASSWORD$)/u;

export function assertMaintenanceEnvironment(environment: NodeJS.ProcessEnv = process.env): void {
  if (Object.keys(environment).some((key) => forbiddenEnvironment.test(key))) {
    throw new Error("maintenance_database_environment_forbidden");
  }
}

function json(response: ServerResponse, status: number, body: Record<string, string>): void {
  const value = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(value),
  });
  response.end(value);
}

export function createMaintenanceStaticApp(staticDirectory: string): RequestListener {
  return (request: IncomingMessage, response: ServerResponse): void => {
    void (async () => {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      if (pathname === "/maintenance-health") {
        if (request.method !== "GET") return json(response, 405, { code: "method_not_allowed" });
        return json(response, 200, { status: "static_alive", database: "not_connected" });
      }
      if (pathname.startsWith("/api/")) return json(response, 503, { code: "api_unavailable_during_maintenance" });
      if (await serveStatic(request, response, staticDirectory)) return;
      json(response, 404, { code: "static_resource_not_found" });
    })().catch(() => json(response, 500, { code: "static_serving_failed" }));
  };
}
