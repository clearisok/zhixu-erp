import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("DEV 固定 3001 且端口占用时不结束未知进程", async () => {
  const source = await read("scripts/dev.ps1");
  const packageJson = JSON.parse(await read("package.json"));
  assert.match(source, /Get-NetTCPConnection -LocalPort 3001 -State Listen/);
  assert.match(source, /npm\.cmd run dev:local/);
  assert.doesNotMatch(source, /Stop-Process|taskkill|TerminateProcess/);
  assert.equal(packageJson.scripts["dev:local"], "vinext dev --hostname 127.0.0.1 --port 3001");
});

test("Docker 普通与 clean rebuild 使用明确的重建流程", async () => {
  const normal = await read("scripts/rebuild-local.ps1");
  const clean = await read("scripts/rebuild-local-clean.ps1");
  for (const source of [normal, clean]) {
    assert.match(source, /docker compose down --remove-orphans/);
    assert.match(source, /docker compose up -d --force-recreate/);
    assert.match(source, /docker compose ps/);
  }
  assert.match(normal, /docker compose build/);
  assert.doesNotMatch(normal, /--no-cache/);
  assert.match(clean, /docker compose build --no-cache/);
});

test("Docker 镜像在 builder 中构建当前源码且最终镜像不复制宿主旧 dist", async () => {
  const dockerfile = await read("Dockerfile");
  const ignore = await read(".dockerignore");
  assert.match(dockerfile, /AS builder/);
  assert.match(dockerfile, /RUN npm run build/);
  assert.match(dockerfile, /COPY --from=builder \/build\/dist\/client \.\/site\//);
  assert.doesNotMatch(dockerfile, /^COPY dist\/client/m);
  assert.match(ignore, /^dist$/m);
});

test("Build Info 同时注入页面和 build-info.json", async () => {
  const vite = await read("vite.config.ts");
  const layout = await read("app/layout.tsx");
  const component = await read("components/foundation/build-info-indicator.tsx");
  assert.match(vite, /fileName: "build-info\.json"/);
  assert.match(vite, /__ZHIXU_BUILD_INFO__/);
  assert.match(layout, /data-build-id=\{buildInfo\.buildId\}/);
  assert.match(component, /Environment:/);
  assert.match(component, /Git Commit:/);
  assert.match(component, /Build Time:/);
});

test("HTML 与 build-info 不强缓存，hash 静态资源使用 immutable", async () => {
  const server = await read("docker-serve.sh");
  assert.match(server, /\*\.html\|\*\/build-info\.json\).*no-store/);
  assert.match(server, /\/app\/site\/assets\/\*\).*max-age=31536000, immutable/);
});
