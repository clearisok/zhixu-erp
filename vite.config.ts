import { execFileSync } from "node:child_process";
import vinext from "vinext";
import { defineConfig, type Plugin } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

type ZhixuBuildInfo = {
  environment: "development" | "production";
  buildId: string;
  gitCommit: string;
  buildTime: string;
};

function shanghaiTimestamp(date: Date): { buildId: string; buildTime: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  const day = `${parts.year}${parts.month}${parts.day}`;
  const time = `${parts.hour}${parts.minute}${parts.second}`;
  return {
    buildId: `${day}-${time}`,
    buildTime: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`,
  };
}

function currentGitCommit(): string {
  if (process.env.ZHIXU_GIT_COMMIT?.trim()) return process.env.ZHIXU_GIT_COMMIT.trim();
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function createBuildInfo(command: "build" | "serve"): ZhixuBuildInfo {
  const generated = shanghaiTimestamp(new Date());
  const requestedEnvironment = process.env.ZHIXU_BUILD_ENV;
  return {
    environment: requestedEnvironment === "development" || requestedEnvironment === "production"
      ? requestedEnvironment
      : command === "serve" ? "development" : "production",
    buildId: process.env.ZHIXU_BUILD_ID?.trim() || generated.buildId,
    gitCommit: currentGitCommit(),
    buildTime: process.env.ZHIXU_BUILD_TIME?.trim() || generated.buildTime,
  };
}

function buildInfoPlugin(buildInfo: ZhixuBuildInfo): Plugin {
  const source = `${JSON.stringify(buildInfo, null, 2)}\n`;
  return {
    name: "zhixu-build-info",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?", 1)[0] !== "/build-info.json") return next();
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store, max-age=0, must-revalidate");
        response.end(source);
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "build-info.json", source });
    },
  };
}

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async ({ command }) => {
  const buildInfo = createBuildInfo(command);
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    define: {
      __ZHIXU_BUILD_INFO__: JSON.stringify(buildInfo),
    },
    server: {
      proxy: {
        "/api/v1": {
          target: process.env.ZHIXU_API_ORIGIN?.trim() || "http://127.0.0.1:3100",
          changeOrigin: false,
        },
      },
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      buildInfoPlugin(buildInfo),
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
