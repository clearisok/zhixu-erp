import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBuildArtifacts, staticAppRoutes } from '../check-build-artifacts.mjs';

const script = fileURLToPath(new URL('../check-build-artifacts.mjs', import.meta.url));
function fixture(t, server = false) {
  const root = mkdtempSync(join(tmpdir(), 'zhixu-build-artifact-test-'));
  t.after(() => rmSync(root, { recursive: true }));
  const env = { ZHIXU_GIT_COMMIT: 'a'.repeat(40), ZHIXU_BUILD_ID: 'synthetic', ZHIXU_BUILD_TIME: '2026-10-23T15:00:00Z', ZHIXU_BUILD_ENV: 'production',
    NEXT_PUBLIC_ZHIXU_QUOTE_AUTHORITY: 'browser', NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY: 'browser',
    NEXT_PUBLIC_ZHIXU_IDENTITY_MODE: 'session', NEXT_PUBLIC_ZHIXU_QUOTE_WRITER_MODE: 'writable', NEXT_PUBLIC_ZHIXU_ORDER_READ: 'disabled',
    ...(server ? { NEXT_PUBLIC_ZHIXU_QUOTE_AUTHORITY: 'server', NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY: 'server',
      NEXT_PUBLIC_ZHIXU_IDENTITY_MODE: 'session', NEXT_PUBLIC_ZHIXU_QUOTE_WRITER_MODE: 'writable', NEXT_PUBLIC_ZHIXU_ORDER_READ: 'snapshot' } : {}) };
  const put = (name, text) => { const path = join(root, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
  const json = (name, value) => put(name, JSON.stringify(value));
  put('app/page.tsx', 'export default function Page() {}');
  put('app/(workspace)/quote-center/page.tsx', 'export default function Page() {}');
  const info = { environment: 'production', buildId: env.ZHIXU_BUILD_ID, gitCommit: env.ZHIXU_GIT_COMMIT, buildTime: env.ZHIXU_BUILD_TIME,
    quoteAuthority: server ? 'server' : 'browser', masterSettingsAuthority: server ? 'server' : 'browser',
    identityMode: 'session', quoteWriterMode: 'writable', orderRead: server ? 'snapshot' : 'disabled' };
  for (const side of ['client', 'server']) json(`dist/${side}/build-info.json`, info);
  const prerender = { trailingSlash: false, routes: ['/', '/quote-center', '/404'].map(route => ({ route, status: 'rendered', router: 'app' })) };
  json('dist/server/vinext-prerender.json', prerender);
  json('dist/client/.vite/manifest.json', { entry: { file: 'assets/app.js', isEntry: true, imports: ['shared'], css: ['assets/app.css'] }, shared: { file: 'assets/shared.js' } });
  for (const name of ['app.js', 'shared.js', 'app.css']) put(`dist/client/assets/${name}`, 'synthetic');
  for (const stem of ['index', 'quote-center', '404']) {
    put(`dist/client/${stem}.html`, '<!doctype html><html><body><script src="/assets/app.js"></script></body></html>');
    if (stem !== '404') put(`dist/client/${stem}.rsc`, '0:synthetic RSC');
  }
  return { root, env, put, json, info, prerender, check: () => checkBuildArtifacts({ root, env }) };
}

test('complete Browser and explicit Server static builds pass using source routes, including route groups', t => {
  for (const server of [false, true]) {
    const f = fixture(t, server);
    assert.deepEqual(staticAppRoutes(join(f.root, 'app')), ['/', '/quote-center']);
    assert.equal(f.check().pages, 2);
    assert.equal(f.check().quoteAuthority, server ? 'server' : 'browser');
  }
});

test('skipped/error routes fail even if a previous build left HTML and RSC behind', t => {
  for (const status of ['skipped', 'error']) {
    const f = fixture(t);
    f.prerender.routes[1].status = status;
    f.json('dist/server/vinext-prerender.json', f.prerender);
    assert.throws(f.check, /build_artifacts_route_not_rendered/u);
  }
});

test('partial 404-only export and missing, duplicate or unexpected route indices fail', t => {
  for (const change of [r => r.slice(-1), r => r.slice(1), r => [...r, r[0]], r => [...r, { route: '/invented', status: 'rendered', router: 'app' }]]) {
    const f = fixture(t);
    f.json('dist/server/vinext-prerender.json', { ...f.prerender, routes: change(f.prerender.routes) });
    assert.throws(f.check, /build_artifacts_(?:missing|unexpected)_prerender_route/u);
  }
});

test('new source pages cannot be omitted and unsupported or duplicate routes fail explicitly', t => {
  const added = fixture(t); added.put('app/new/page.tsx', 'new page');
  assert.throws(added.check, /build_artifacts_missing_prerender_route/u);
  for (const route of ['[id]', '@modal']) {
    const f = fixture(t); f.put(`app/${route}/page.tsx`, 'new page');
    assert.throws(f.check, /build_artifacts_unsupported_route/u);
  }
  const collision = fixture(t); collision.put('app/quote-center/page.tsx', 'duplicate');
  assert.throws(collision.check, /build_artifacts_duplicate_source_route/u);
});

test('missing or empty HTML, RSC, fallback and build metadata cannot pass', t => {
  for (const name of ['dist/client/quote-center.html', 'dist/client/index.rsc', 'dist/client/404.html', 'dist/client/build-info.json', 'dist/server/build-info.json']) {
    for (const empty of [false, true]) {
      const f = fixture(t);
      if (empty) f.put(name, ''); else rmSync(join(f.root, name));
      assert.throws(f.check, /build_artifacts_missing_or_invalid_file/u);
    }
  }
});

test('stale or mismatched build identity, authority and malformed metadata fail', t => {
  for (const field of ['gitCommit', 'buildId', 'buildTime', 'quoteAuthority', 'orderRead', 'identityMode', 'masterSettingsAuthority', 'quoteWriterMode']) {
    const f = fixture(t, true);
    const other = { ...f.info, [field]: field === 'buildTime' ? '2026-10-22T00:00:00Z' : 'different' };
    for (const side of ['client', 'server']) f.json(`dist/${side}/build-info.json`, other);
    assert.throws(f.check, /build_artifacts_(?:invalid_build_identity|build_identity_mismatch)/u);
  }
  const mismatch = fixture(t); mismatch.json('dist/server/build-info.json', { ...mismatch.info, buildId: 'older' });
  assert.throws(mismatch.check, /build_artifacts_build_identity_mismatch/u);
  const malformed = fixture(t); malformed.put('dist/server/vinext-prerender.json', '{');
  assert.throws(malformed.check, /build_artifacts_invalid_json/u);
});

test('missing chunks, manifest dependencies, unsafe paths and incomplete HTML fail', t => {
  const absent = fixture(t); rmSync(join(absent.root, 'dist/client/assets/shared.js'));
  assert.throws(absent.check, /build_artifacts_missing_or_invalid_file/u);
  const dependency = fixture(t); dependency.json('dist/client/.vite/manifest.json', { entry: { file: 'assets/app.js', isEntry: true, imports: ['absent'] } });
  assert.throws(dependency.check, /build_artifacts_missing_asset_dependency/u);
  const escape = fixture(t); escape.json('dist/client/.vite/manifest.json', { entry: { file: '../../outside.js', isEntry: true } });
  assert.throws(escape.check, /build_artifacts_unsafe_path/u);
  const badHtml = fixture(t); badHtml.put('dist/client/index.html', '<html><body>truncated');
  assert.throws(badHtml.check, /build_artifacts_invalid_html/u);
  const referenced = fixture(t); referenced.put('dist/client/index.html', '<html><body><script src="/assets/missing.js"></script></body></html>');
  assert.throws(referenced.check, /build_artifacts_missing_or_invalid_file/u);
});

test('actual CLI rejects an incomplete build with nonzero exit and no raw errors', t => {
  const f = fixture(t);
  const ok = JSON.parse(execFileSync(process.execPath, [script], { cwd: f.root, env: { ...process.env, ...f.env }, encoding: 'utf8' }));
  assert.equal(ok.status, 'PASS');
  f.prerender.routes[1] = { route: '/quote-center', status: 'skipped', reason: 'synthetic-sensitive-error' };
  f.json('dist/server/vinext-prerender.json', f.prerender);
  const failed = spawnSync(process.execPath, [script], { cwd: f.root, env: { ...process.env, ...f.env }, encoding: 'utf8' });
  assert.equal(failed.status, 1);
  assert.equal(failed.stdout, '');
  assert.deepEqual(JSON.parse(failed.stderr), { status: 'FAIL', code: 'build_artifacts_route_not_rendered' });
  assert.doesNotMatch(failed.stderr, /synthetic-sensitive-error/u);
});

test('the formal npm build requires the artifact guard after compilation', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts.build, 'vinext build && node scripts/check-build-artifacts.mjs');
});

test('CLI invoked through a directory alias still checks and rejects partial output', t => {
  const f = fixture(t);
  const alias = join(f.root, 'tool-alias');
  symlinkSync(dirname(script), alias, process.platform === 'win32' ? 'junction' : 'dir');
  rmSync(join(f.root, 'dist/client/index.rsc'));
  const result = spawnSync(process.execPath, [join(alias, 'check-build-artifacts.mjs')], { cwd: f.root, env: { ...process.env, ...f.env }, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stderr), { status: 'FAIL', code: 'build_artifacts_missing_or_invalid_file' });
});

test('production dotenv-only Server inputs use the same precedence and expansion as vinext', t => {
  const f = fixture(t, true);
  const values = { ...f.env };
  for (const key of Object.keys(f.env)) delete f.env[key];
  f.put('.env', 'ZHIXU_BUILD_ID=lower-priority\n');
  f.put('.env.production', Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n'));
  f.put('.env.local', 'PUBLIC_BUILD_PREFIX=syn\nZHIXU_BUILD_ID=${PUBLIC_BUILD_PREFIX}thetic\n');
  assert.equal(f.check().quoteAuthority, 'server');
  const env = { ...process.env };
  for (const key of Object.keys(values)) delete env[key];
  const result = JSON.parse(execFileSync(process.execPath, [script], { cwd: f.root, env, encoding: 'utf8' }));
  assert.equal(result.status, 'PASS');
  f.put('.env.production.local', 'ZHIXU_BUILD_ID=unexpected-new-input\n');
  assert.throws(f.check, /build_artifacts_build_identity_mismatch/u);
});

test('explicit shell build inputs override dotenv without weakening stale-identity rejection', t => {
  const f = fixture(t, true);
  f.put('.env.production.local', 'NEXT_PUBLIC_ZHIXU_QUOTE_AUTHORITY=browser\nNEXT_PUBLIC_ZHIXU_ORDER_READ=disabled\nZHIXU_BUILD_ID=older\n');
  assert.equal(f.check().quoteAuthority, 'server');
  assert.equal(f.check().buildId, 'synthetic');
  f.env.ZHIXU_BUILD_ID = 'new-shell-identity';
  assert.throws(f.check, /build_artifacts_build_identity_mismatch/u);
});
