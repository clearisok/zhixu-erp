import { readFile, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

async function existingFile(path: string): Promise<string | null> {
  try {
    return (await stat(path)).isFile() ? path : null;
  } catch {
    return null;
  }
}

export async function serveStatic(
  request: IncomingMessage,
  response: ServerResponse,
  staticDirectory: string,
): Promise<boolean> {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  } catch {
    return false;
  }
  if (pathname.includes("\0")) return false;

  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const root = resolve(staticDirectory);
  const direct = resolve(root, relative);
  if (direct !== root && !direct.startsWith(`${root}${sep}`)) return false;
  const candidates = extname(direct)
    ? [direct]
    : [direct, `${direct}.html`, resolve(direct, "index.html")];
  const file = (await Promise.all(candidates.map(existingFile))).find(Boolean) ?? null;
  if (!file) return false;

  const body = await readFile(file);
  const extension = extname(file).toLowerCase();
  response.statusCode = 200;
  response.setHeader("Content-Type", contentTypes[extension] ?? "application/octet-stream");
  response.setHeader(
    "Cache-Control",
    extension === ".html" || file.endsWith("build-info.json")
      ? "no-store, max-age=0, must-revalidate"
      : pathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300",
  );
  response.setHeader("Content-Length", body.length);
  response.end(request.method === "HEAD" ? undefined : body);
  return true;
}
