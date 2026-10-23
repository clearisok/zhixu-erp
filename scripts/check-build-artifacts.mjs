import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Use the locked framework's own production dotenv precedence/expansion, just
// like its build CLI. Do not duplicate a parser or mutate the caller's env.
const { loadDotenv } = await import(new URL('./config/dotenv.js', import.meta.resolve('vinext')));

const fail = code => { throw new Error(`build_artifacts_${code}`); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function requiredFile(root, name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || isAbsolute(name)) fail('unsafe_path');
  const target = resolve(root, name);
  if (!target.startsWith(`${root}${sep}`)) fail('unsafe_path');
  try {
    const info = lstatSync(target);
    if (!info.isFile() || info.size === 0 || info.size > 32 * 1024 * 1024) fail('missing_or_invalid_file');
    const actual = realpathSync.native(target);
    if (!actual.startsWith(`${root}${sep}`)) fail('unsafe_path');
    return readFileSync(target, 'utf8');
  } catch (error) {
    if (error.message?.startsWith('build_artifacts_')) throw error;
    fail('missing_or_invalid_file');
  }
}

function jsonFile(root, name) {
  const text = requiredFile(root, name);
  try { return JSON.parse(text); } catch { fail('invalid_json'); }
}

// The application currently exports static App Router pages. New dynamic or
// parallel routing needs an explicit export policy, never a silent omission.
export function staticAppRoutes(appRoot) {
  const routes = new Set();
  let entries = 0;
  function walk(directory, segments) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (++entries > 4096) fail('source_inventory_limit');
      if (entry.isSymbolicLink()) fail('source_symlink');
      if (entry.isDirectory()) {
        if (entry.name.startsWith('_')) continue;
        if (/[@\[\]]/u.test(entry.name)) fail('unsupported_route');
        const group = /^\([^()]+\)$/u.test(entry.name);
        if (!group && !/^[A-Za-z0-9_-]+$/u.test(entry.name)) fail('unsupported_route');
        walk(join(directory, entry.name), group ? segments : [...segments, entry.name]);
      } else if (entry.isFile() && /^page\.(?:tsx|ts|jsx|js|mdx)$/u.test(entry.name)) {
        const route = `/${segments.join('/')}`;
        if (routes.has(route)) fail('duplicate_source_route');
        routes.add(route);
      }
    }
  }
  walk(appRoot, []);
  if (!routes.has('/')) fail('source_root_missing');
  return [...routes].sort();
}

function expectedBuild(root, env) {
  env = { ...env };
  loadDotenv({ root, mode: 'production', processEnv: env });
  let commit = env.ZHIXU_GIT_COMMIT?.trim();
  if (!commit) {
    try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { commit = 'unknown'; }
  }
  return {
    environment: ['development', 'production'].includes(env.ZHIXU_BUILD_ENV) ? env.ZHIXU_BUILD_ENV : 'production',
    gitCommit: commit,
    quoteAuthority: env.NEXT_PUBLIC_ZHIXU_QUOTE_AUTHORITY || 'browser',
    masterSettingsAuthority: env.NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY || 'browser',
    quoteWriterMode: env.NEXT_PUBLIC_ZHIXU_QUOTE_WRITER_MODE || 'writable',
    identityMode: env.NEXT_PUBLIC_ZHIXU_IDENTITY_MODE || 'session',
    orderRead: env.NEXT_PUBLIC_ZHIXU_ORDER_READ || 'disabled',
    ...(env.ZHIXU_BUILD_ID?.trim() ? { buildId: env.ZHIXU_BUILD_ID.trim() } : {}),
    ...(env.ZHIXU_BUILD_TIME?.trim() ? { buildTime: env.ZHIXU_BUILD_TIME.trim() } : {}),
  };
}

export function checkBuildArtifacts({ root = process.cwd(), env = process.env } = {}) {
  root = realpathSync.native(root);
  const client = join(root, 'dist', 'client');
  const server = join(root, 'dist', 'server');
  const routes = staticAppRoutes(join(root, 'app'));
  const expectedRoutes = [...routes, '/404'];
  const prerender = jsonFile(server, 'vinext-prerender.json');
  if (!object(prerender) || !Array.isArray(prerender.routes) || prerender.trailingSlash !== false) fail('invalid_prerender_index');
  const indexed = new Set();
  for (const row of prerender.routes) {
    if (!object(row) || !expectedRoutes.includes(row.route) || indexed.has(row.route)) fail('unexpected_prerender_route');
    if (row.status !== 'rendered' || row.router !== 'app') fail('route_not_rendered');
    indexed.add(row.route);
  }
  if (indexed.size !== expectedRoutes.length) fail('missing_prerender_route');

  const info = jsonFile(client, 'build-info.json');
  const serverInfo = jsonFile(server, 'build-info.json');
  if (!object(info) || !object(serverInfo) ||
      Object.keys(info).length !== Object.keys(serverInfo).length ||
      Object.entries(info).some(([key, value]) => serverInfo[key] !== value)) fail('build_identity_mismatch');
  if (typeof info.buildId !== 'string' || !info.buildId.trim() ||
      typeof info.buildTime !== 'string' || !Number.isFinite(Date.parse(info.buildTime)) ||
      !/^(?:[a-f0-9]{7,40}|unknown)$/u.test(info.gitCommit ?? '')) fail('invalid_build_identity');
  for (const [key, value] of Object.entries(expectedBuild(root, env))) {
    if (info[key] !== value) fail('build_identity_mismatch');
  }

  const manifest = jsonFile(client, '.vite/manifest.json');
  if (!object(manifest) || !Object.values(manifest).some(row => object(row) && row.isEntry === true)) fail('invalid_asset_manifest');
  const assets = new Set();
  for (const row of Object.values(manifest)) {
    if (!object(row) || typeof row.file !== 'string') fail('invalid_asset_manifest');
    for (const list of ['css', 'assets', 'imports', 'dynamicImports']) {
      if (row[list] !== undefined && (!Array.isArray(row[list]) || row[list].some(item => typeof item !== 'string'))) fail('invalid_asset_manifest');
    }
    for (const key of [...(row.imports ?? []), ...(row.dynamicImports ?? [])]) {
      if (!Object.hasOwn(manifest, key)) fail('missing_asset_dependency');
    }
    for (const asset of [row.file, ...(row.css ?? []), ...(row.assets ?? [])]) {
      requiredFile(client, asset);
      assets.add(asset);
    }
  }
  const warnings = [];
  for (const route of expectedRoutes) {
    const stem = route === '/' ? 'index' : route.slice(1);
    const html = requiredFile(client, `${stem}.html`);
    if (!/<html(?:\s|>)/iu.test(html) || !/<body(?:\s|>)/iu.test(html) || !/<\/html>/iu.test(html)) fail('invalid_html');
    for (const [tag] of html.matchAll(/<(?:[^"'<>]|"[^"]*"|'[^']*')+>/gu)) {
      const attributes = [...tag.matchAll(/\s+([A-Za-z][A-Za-z0-9:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu)]
        .map(match => ({ name: match[1].toLowerCase(), value: match[2] ?? match[3] ?? match[4] ?? '' }));
      const relations = attributes.filter(attribute => attribute.name === 'rel');
      const hint = /^<link\s/iu.test(tag) && relations.length === 1 && relations[0].value.toLowerCase() === 'modulepreload';
      for (const { name, value } of attributes) {
        if (!['src', 'href'].includes(name) || !value.startsWith('/assets/')) continue;
        const asset = value.split(/[?#]/u, 1)[0].slice(1);
        const target = resolve(client, asset);
        if (!target.startsWith(`${client}${sep}`) || asset.includes('\\')) fail('unsafe_path');
        // A preload hint does not execute a module. Missing manifest/runtime
        // dependencies remain fatal; unresolved hints are visible diagnostics.
        if (hint && name === 'href' && !assets.has(asset) && !existsSync(target)) {
          warnings.push({ code: 'unresolved_modulepreload', route, asset });
        } else requiredFile(client, asset);
      }
    }
    if (route !== '/404') requiredFile(client, `${stem}.rsc`);
  }
  return { status: 'PASS', pages: routes.length, fallbackPages: 1, assets: assets.size,
    buildId: info.buildId, gitCommit: info.gitCommit, quoteAuthority: info.quoteAuthority,
    warningCount: warnings.length, warnings,
    scope: 'required static artifacts only; preload hints may warn; not browser, API, database, deployment or user acceptance' };
}

let invokedDirectly = false;
try {
  invokedDirectly = Boolean(process.argv[1]) &&
    realpathSync.native(resolve(process.argv[1])) === realpathSync.native(fileURLToPath(import.meta.url));
} catch { invokedDirectly = false; }
if (invokedDirectly) {
  try {
    if (process.argv.length !== 2) fail('arguments_not_supported');
    console.log(JSON.stringify(checkBuildArtifacts(), null, 2));
  } catch (error) {
    const code = error.message?.startsWith('build_artifacts_') ? error.message : 'build_artifacts_check_failed';
    console.error(JSON.stringify({ status: 'FAIL', code }));
    process.exitCode = 1;
  }
}
