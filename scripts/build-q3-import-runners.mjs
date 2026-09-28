import { createRequire } from "node:module";
import { resolve } from "node:path";

// Bundle only the two isolated operational entrypoints. Existing Browser-model
// sources use extensionless imports that plain tsc output cannot execute in Node.
const requireFromTsx = createRequire(import.meta.resolve("tsx"));
const { build } = requireFromTsx("esbuild");
await build({
  entryPoints: [
    resolve("server/quote-masters/disposable-rehearsal-cli.ts"),
    resolve("server/quote-masters/guarded-import-cli.ts"),
  ],
  outdir: resolve("dist/server/q3"),
  outExtension: { ".js": ".mjs" },
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  target: "node22",
  logLevel: "warning",
});
