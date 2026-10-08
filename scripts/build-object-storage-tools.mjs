import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Portable offline-only package. Explicit source list: no .env/secrets/dependency tree.
const root = "dist/cos-tools";
await mkdir(join(root, "scripts"), { recursive: true });
const path = join("dist", "server", "server", "attachments");
await mkdir(join(root, path), { recursive: true });
await copyFile("scripts/setup-object-storage-credentials.mjs", join(root, "scripts", "setup-object-storage-credentials.mjs"));
for (const file of ["storage-config.js", "storage-config-loader.js", "check-config-cli.js"])
  await copyFile(join(path, file), join(root, path, file));
await writeFile(join(root, "package.json"), JSON.stringify({ private: true, type: "module" }) + "\n");
console.log("offline_object_storage_tools_built");
