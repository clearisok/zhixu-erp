// Packaging only: never connects to a database or changes a deployment/image tag.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import { publishedImage, publishedSource, attachmentMigration, sha256, verifyPackaging } from "./quote-creation-packaging-policy.mjs";

const root = resolve(".");
const git = args => execFileSync("git", args, { cwd: root, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
assert.equal(git(["status", "--porcelain"]).toString().trim(), "", "clean_committed_source_required");
const source = git(["rev-parse", "HEAD"]).toString().trim(); assert.match(source, /^[a-f0-9]{40}$/u);
const docker = args => execFileSync("docker", args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
const labels = JSON.parse(docker(["image", "inspect", publishedImage, "--format", "{{json .Config.Labels}}"]));
assert.equal(labels["org.opencontainers.image.revision"], publishedSource);
const encoded = JSON.parse(docker(["run", "--rm", "--network", "none", "--entrypoint", "node", publishedImage, "-e",
  "const f=require('fs');console.log(JSON.stringify(Object.fromEntries(f.readdirSync('database/migrations').filter(n=>n.endsWith('.sql')).map(n=>[n,f.readFileSync('database/migrations/'+n).toString('base64')]))))"]));
const published = Object.fromEntries(Object.entries(encoded).map(([name, data]) => [name, Buffer.from(data, "base64")]));
const names = (await readdir(resolve(root, "database/migrations"))).filter(n => n.endsWith(".sql")).sort();
const checkout = {}, committed = {};
for (const name of names) {
  checkout[name] = await readFile(resolve(root, "database/migrations", name));
  committed[name] = git(["show", `HEAD:database/migrations/${name}`]);
}
const expected = verifyPackaging(checkout, published, committed);
const folder = await mkdtemp(resolve(tmpdir(), "zhixu-creation-package-"));
const context = resolve(folder, "context"); await mkdir(context);
// Copy only tracked files; no private/untracked configuration, credentials or backup.
for (const path of git(["ls-files", "-z"]).toString().split("\0").filter(Boolean)) {
  const from = resolve(root, path), to = resolve(context, path);
  assert.ok(from.startsWith(root + sep) && to.startsWith(context + sep), "tracked_path_escape");
  assert.ok((await lstat(from)).isFile(), "tracked_regular_file_required");
  await mkdir(dirname(to), { recursive: true }); await copyFile(from, to);
}
await writeFile(resolve(context, "database/migrations", attachmentMigration), published[attachmentMigration]);
for (const name of names) assert.equal(sha256(await readFile(resolve(context, "database/migrations", name))), expected[name]);
assert.equal(git(["status", "--porcelain"]).toString().trim(), "", "source_changed_during_packaging");
assert.equal(git(["rev-parse", "HEAD"]).toString().trim(), source);
const manifest = { result: "PACKAGING_VERIFIED", source, publishedImage, publishedSource, context,
  modifiedContextFiles: ["database/migrations/" + attachmentMigration], lineEndingsOnly: true,
  sourceChecksums: Object.fromEntries(names.map(name => [name, sha256(checkout[name])])), packagedChecksums: expected };
await writeFile(resolve(folder, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ ...manifest, manifestPath: resolve(folder, "manifest.json") }));
