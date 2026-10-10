// An image-only, disposable Linux smoke. No caller-supplied DB/port/credential/volume.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const image = process.argv[2];
if (!/^zhixu-quote-two-step:[a-z0-9-]+$/u.test(image ?? "")) throw new Error("isolated_candidate_image_required");
const docker = async args => {
  try {
    const result = await execute("docker", args, { windowsHide: true, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
    return (args[0] === "logs" ? result.stdout + result.stderr : result.stdout).trim();
  }
  catch { throw new Error("disposable_candidate_command_failed"); } // no command/env/raw sensitive error output
};
const suffix = randomBytes(6).toString("hex");
const network = `zhixu-two-step-smoke-${suffix}`;
const database = `${network}-db`, app = `${network}-app`;
const password = `synthetic-${randomBytes(20).toString("hex")}`;
const env = ["--env", "DB_HOST=" + database, "--env", "DB_PORT=5432", "--env", "DB_NAME=quote_creation_candidate", "--env", "DB_USER=postgres", "--env", "DB_PASSWORD=" + password,
  "--env", "ZHIXU_SERVER_HOST=0.0.0.0", "--env", "ZHIXU_SERVER_PORT=3000", "--env", "ZHIXU_ALLOWED_ORIGINS=https://candidate.invalid", "--env", "ZHIXU_COOKIE_SECURE=true",
  "--env", "ZHIXU_ADMIN_USERNAME=synthetic-candidate-admin", "--env", "ZHIXU_ADMIN_PASSWORD=" + password, "--env", "ZHIXU_ATTACHMENT_STORAGE=disabled"];
const owned = new Set(); let networkCreated = false;
const delay = () => new Promise(done => setTimeout(done, 300));
const labels = JSON.parse(await docker(["image", "inspect", image, "--format", "{{json .Config.Labels}}"]));
assert.match(labels["org.opencontainers.image.revision"], /^[a-f0-9]{40}$/u);
assert.equal(labels["io.zhixu.quote-authority"], "server"); assert.equal(labels["io.zhixu.master-settings-authority"], "server");
assert.equal(labels["io.zhixu.quote-writer-mode"], "writable"); assert.equal(labels["io.zhixu.identity-mode"], "session");
const manifest = JSON.parse(await docker(["run", "--rm", "--network", "none", "--entrypoint", "node", image, "--input-type=module", "-e",
  "import {readFileSync,readdirSync} from 'node:fs';import {createHash} from 'node:crypto';console.log(JSON.stringify({build:JSON.parse(readFileSync('dist/client/build-info.json','utf8')),migrations:Object.fromEntries(readdirSync('database/migrations').map(n=>[n,createHash('sha256').update(readFileSync('database/migrations/'+n)).digest('hex')]))}));"]));
assert.equal(manifest.build.gitCommit, labels["org.opencontainers.image.revision"]);
assert.equal(manifest.build.buildId, labels["io.zhixu.build-id"]); assert.equal(manifest.build.buildTime, labels["org.opencontainers.image.created"]);
for (const [field, value] of Object.entries({ quoteAuthority: "server", masterSettingsAuthority: "server", quoteWriterMode: "writable", identityMode: "session" })) assert.equal(manifest.build[field], value);
const migrationNames = (await readdir(resolve("database/migrations"))).filter(n => n.endsWith(".sql")).sort();
assert.equal(migrationNames.length, 10);
for (const name of migrationNames) assert.equal(manifest.migrations[name], createHash("sha256").update(await readFile(resolve("database/migrations", name))).digest("hex"), name);
const probe = script => docker(["exec", app, "node", "--input-type=module", "-e", script]);
const ready = async () => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try { await probe("const r=await fetch('http://127.0.0.1:3000/api/v1/health');if(r.status!==200||(await r.json()).status!=='ok')process.exit(1)"); return; }
    catch { await delay(); }
  }
  throw new Error("disposable_candidate_not_ready");
};
try {
  await docker(["network", "create", "--internal", network]); networkCreated = true;
  await docker(["run", "--detach", "--name", database, "--network", network, "--tmpfs", "/var/lib/postgresql/data", "--env", "POSTGRES_DB=quote_creation_candidate", "--env", "POSTGRES_PASSWORD=" + password, "postgres:16-alpine"]); owned.add(database);
  const until = Date.now() + 30_000;
  while (true) { try { await docker(["exec", database, "pg_isready", "-U", "postgres", "-d", "quote_creation_candidate"]); break; } catch { if (Date.now() >= until) throw new Error("disposable_pg_not_ready"); await delay(); } }
  await docker(["run", "--detach", "--name", app, "--network", network, ...env, image]); owned.add(app);
  const waiting = Date.now() + 30_000; let state;
  do { state = JSON.parse(await docker(["inspect", app, "--format", "{{json .State}}"])); if (!state.Running) break; await delay(); } while (Date.now() < waiting);
  assert.equal(state.Running, false); assert.equal(state.ExitCode, 1, "startup must not migrate an empty DB");
  const log = await docker(["logs", app]); assert.ok(log.includes('"code":"pending_migrations"'));
  const ledgerAbsent = await docker(["exec", database, "psql", "-U", "postgres", "-d", "quote_creation_candidate", "-Atc", "SELECT to_regclass('public.schema_migrations') IS NULL"]); assert.equal(ledgerAbsent, "t");
  await docker(["rm", app]); owned.delete(app);
  const migrationOutput = await docker(["run", "--rm", "--network", network, ...env, "--entrypoint", "node", image, "dist/server/server/db/migrate.js"]);
  const migrated = JSON.parse(migrationOutput); assert.deepEqual(migrated.applied, migrationNames);
  await docker(["run", "--detach", "--name", app, "--network", network, ...env, image]); owned.add(app); await ready();
  const result = JSON.parse(await probe(`
    import assert from 'node:assert/strict'; import pg from 'pg'; import {randomUUID} from 'node:crypto';
    const base='http://127.0.0.1:3000';
    const build=await(await fetch(base+'/build-info.json')).json();
    assert.equal(build.gitCommit,${JSON.stringify(manifest.build.gitCommit)});
    assert.equal((await fetch(base+'/api/v1/quotes/creation-options')).status,401);
    const auth=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{Origin:'https://candidate.invalid','X-Zhixu-Request':'1','Content-Type':'application/json'},body:JSON.stringify({username:'synthetic-candidate-admin',password:process.env.ZHIXU_ADMIN_PASSWORD})});
    assert.equal(auth.status,200);const cookie=auth.headers.get('set-cookie').split(';')[0];
    const request=async(path,body)=>{const r=await fetch(base+'/api/v1/quotes/'+path,{headers:{Cookie:cookie,Origin:'https://candidate.invalid','X-Zhixu-Request':'1','Content-Type':'application/json'},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});return{status:r.status,body:await r.json()}};
    assert.deepEqual((await request('creation-options')).body,{brands:[],salespeople:[],presets:[],truncated:false});
    const input={source:null,quoteType:'processing',selection:{country:null,presetId:null},fields:{brandId:null,salespersonId:null,styleNo:'SYNTHETIC-CANDIDATE',styleName:'',quantity:'0',garmentLeadDate:'2028-02-29',note:''},parameterOverrides:{}};
    const review=await request('creation-preview',input);assert.equal(review.status,200);assert.equal(review.body.configuration.status,'incomplete');
    const token=randomUUID();const command={...input,previewId:review.body.previewId,clientRequestId:token,imageSelection:null};
    const made=await request('creation-workflows',command);assert.equal(made.status,201);
    const replay=await request('creation-workflows',command);assert.equal(replay.status,200);assert.deepEqual(replay.body.result,made.body.result);
    const record=(await request(made.body.result.quoteId)).body.quote;assert.equal(record.version,1);
    const revision=record.quote.revisions[0];assert.equal(revision.baseInfo.quoteType,'processing');assert.equal(revision.baseInfo.garmentLeadDate,'2028-02-29');assert.equal(revision.priceVersions[0].quantity,'0');assert.equal(revision.priceVersions[0].pricingParameters.markupRate,null);
    const pool=new pg.Pool({host:process.env.DB_HOST,port:5432,user:'postgres',password:process.env.DB_PASSWORD,database:'quote_creation_candidate'});
    assert.equal((await pool.query('SELECT count(*) FROM quote_center_quotes')).rows[0].count,'1');assert.equal((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count,'10');
    console.log(JSON.stringify({result:'PASS',token,quoteId:record.quote.id,version:record.version,quoteCount:1,ledgerCount:10,build}));await pool.end();
  `));
  await docker(["restart", app]); await ready();
  await probe(`import assert from 'node:assert/strict';import pg from 'pg';const p=new pg.Pool({host:process.env.DB_HOST,port:5432,user:'postgres',password:process.env.DB_PASSWORD,database:'quote_creation_candidate'});const r=(await p.query('SELECT state,result FROM quote_creation_receipts WHERE client_request_id=$1',[${JSON.stringify(result.token)}])).rows[0];assert.equal(r.state,'committed');assert.equal(r.result.quoteId,${JSON.stringify(result.quoteId)});assert.equal((await p.query('SELECT count(*) FROM quote_center_quotes')).rows[0].count,'1');await p.end();`);
  for (const name of [database, app]) {
    const binding = JSON.parse(await docker(["inspect", name, "--format", "{{json .NetworkSettings.Ports}}"]));
    assert.ok(Object.values(binding).every(value => value === null), "no host port publishing");
    const mounts = JSON.parse(await docker(["inspect", name, "--format", "{{json .Mounts}}"])); assert.ok(mounts.every(m => m.Type === "tmpfs"), "no business or host volume mounted");
  }
  console.log(JSON.stringify({ candidate: image, imageId: await docker(["image", "inspect", image, "--format", "{{.Id}}"]), build: manifest.build, checks: { linuxNode22: true, imageMigrationBytes: true, startupVerifyOnly: true, tenMigrationsDisposable: true, trustedAtomicCreateReplay: true, restartDurableReceipt: true, isolatedInternalNetwork: true, hostPorts: 0, mountedPersistentVolumes: 0, realEnvironmentOperations: false } }));
} finally {
  for (const name of owned) await docker(["rm", "--force", name]);
  if (networkCreated) await docker(["network", "rm", network]);
  assert.equal(await docker(["ps", "-a", "--filter", "name=" + network, "--format", "{{.Names}}"]), "");
  console.log(JSON.stringify({ disposableCleanup: "PASS", retainedCandidateImage: image }));
}
