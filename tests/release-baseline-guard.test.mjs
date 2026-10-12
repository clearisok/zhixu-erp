import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateBaseline, manifestPath } from '../scripts/check-release-baseline.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const original = JSON.parse(readFileSync(path.join(repository, manifestPath), 'utf8'));
const commits = new Set([original.baselineSha, ...original.evidence.flatMap(item => [item.recordedAtSha, item.renderedSourceSha]), ...original.runtimeSnapshots.map(item => item.sourceSha)].filter(Boolean));

function fixture(t) {
  const parent = realpathSync(tmpdir());
  const root = mkdtempSync(path.join(parent, 'zhixu-baseline-test-'));
  t.after(() => {
    const resolved = realpathSync(root);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('zhixu-baseline-test-'));
    rmSync(resolved, { recursive: true, force: true });
  });
  const manifest = structuredClone(original);
  const files = new Set([
    ...manifest.evidence.map(item => item.path),
    ...manifest.pages.flatMap(page => [page.routeFile, ...page.components]),
    ...[manifest.css.production, ...manifest.css.previews].flatMap(entry => [entry.entry, ...entry.styles]),
    'components/foundation/responsive.ts', 'features/quote-center/authority/quote-authority.ts',
    'docs/CURRENT_STATE.md', 'docs/AI_HANDOFF.md', 'docs/PROJECT_INDEX.md',
  ]);
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    copyFileSync(path.join(repository, file), path.join(root, file));
  }
  const write = (file, value) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), value);
  };
  const edit = (file, transform) => write(file, transform(readFileSync(path.join(root, file), 'utf8')));
  const check = (overrides = {}) => validateBaseline({ root, manifest, expectedBaseSha: original.baselineSha, hasCommit: value => commits.has(value), ...overrides });
  return { root, manifest, write, edit, check };
}
const has = (errors, code) => assert.ok(errors.some(error => error.code === code), `Expected ${code}; got ${JSON.stringify(errors)}`);

test('real manifest resolves scoped page/evidence/status contracts without a runtime connection', t => {
  assert.deepEqual(fixture(t).check(), []);
});

for (const [label, entry] of [['production', 'app/layout.tsx'], ['preview', 'features/ainuoke-material-progress/integration-preview/main.tsx']]) {
  test(`missing Foundation in ${label} is a blocking failure`, t => {
    const f = fixture(t);
    f.edit(entry, source => source.replace(/^.*import ['"].*foundation\.css['"];\r?\n/m, ''));
    has(f.check(), 'CSS_ENTRY_ORDER');
  });
}

test('changing both source and manifest cannot silently remove required Foundation', t => {
  const f = fixture(t), entry = f.manifest.css.previews[0];
  f.edit(entry.entry, source => source.replace(/^.*import ['"].*foundation\.css['"];\r?\n/m, ''));
  entry.styles = entry.styles.filter(file => file !== 'app/foundation.css');
  has(f.check(), 'FOUNDATION_REQUIRED');
});

test('preview CSS reordered together with its manifest still violates production shared order', t => {
  const f = fixture(t), entry = f.manifest.css.previews[0];
  f.edit(entry.entry, source => source.replace("import '@/app/quote-center/quote-center.css';", '__QUOTE_IMPORT__')
    .replace("import '@/app/order-center/order-center.css';", "import '@/app/quote-center/quote-center.css';")
    .replace('__QUOTE_IMPORT__', "import '@/app/order-center/order-center.css';"));
  [entry.styles[1], entry.styles[2]] = [entry.styles[2], entry.styles[1]];
  has(f.check(), 'CSS_SHARED_ORDER');
});

test('wrong PR base and missing local commit object are distinct blocking failures', t => {
  const f = fixture(t);
  has(f.check({ expectedBaseSha: '0'.repeat(40) }), 'BASE_SHA_MISMATCH');
  has(f.check({ hasCommit: () => false }), 'SOURCE_SHA');
});

test('short SHA is not accepted as a baseline identity', t => {
  const f = fixture(t); f.manifest.baselineSha = original.baselineSha.slice(0, 7);
  has(f.check(), 'SOURCE_SHA');
});

test('missing screenshot blocks; existing filename alone is not evidence', t => {
  const f = fixture(t); f.manifest.evidence.find(item => item.kind === 'screenshot').path = 'docs/missing.png';
  has(f.check(), 'EVIDENCE_PATH');
});

test('overwritten approved PNG is detected by bytes, not file existence', t => {
  const f = fixture(t), image = f.manifest.evidence.find(item => item.kind === 'screenshot');
  f.write(image.path, Buffer.concat([readFileSync(path.join(f.root, image.path)), Buffer.from('modified')]));
  has(f.check(), 'SCREENSHOT_HASH');
});

test('path traversal cannot read evidence outside the repository', t => {
  const f = fixture(t); f.manifest.evidence[0].path = '../outside.md';
  has(f.check(), 'EVIDENCE_PATH');
});

test('undefined evidence ID and omitted critical page fail closed', t => {
  const f = fixture(t); f.manifest.pages[0].evidence.push('invented');
  f.manifest.pages = f.manifest.pages.filter(page => page.id !== 'login');
  const errors = f.check(); has(errors, 'EVIDENCE_REFERENCE'); has(errors, 'PAGE_REQUIRED');
});

test('single done label cannot replace independent capability/deployment dimensions', t => {
  const f = fixture(t); f.manifest.capabilities[0].implemented = 'done';
  delete f.manifest.capabilities[0].environments;
  const errors = f.check(); has(errors, 'CAPABILITY_STATUS'); has(errors, 'DEPLOYMENT_STATUS');
});

test('unimplemented feature cannot claim isolated PASS', t => {
  const f = fixture(t); f.manifest.capabilities.find(cap => cap.id === 'intake').isolatedTest = 'passed-historical';
  has(f.check(), 'CAPABILITY_OVERCLAIM');
});

test('historical runtime observations cannot be relabelled as live verification by this guard', t => {
  const f = fixture(t); f.manifest.runtimeSnapshots[0].reverifiedByThisTask = true;
  has(f.check(), 'RUNTIME_SNAPSHOT');
});

test('allowlist change is detected without opening or requesting a production route', t => {
  const f = fixture(t);
  f.edit('features/quote-center/authority/quote-authority.ts', source => source.replace('return ["/",', 'return ["/order-center", "/",'));
  has(f.check(), 'ROUTE_CAPABILITY_DRIFT');
});

test('snapshot documents must refer to the same full reviewed baseline', t => {
  const f = fixture(t); f.edit('docs/CURRENT_STATE.md', source => source.replaceAll(original.baselineSha, 'old-baseline'));
  has(f.check(), 'STATE_BASELINE_DRIFT');
});

test('responsive drift blocks without deciding the unresolved D-023 policy', t => {
  const f = fixture(t); f.edit('components/foundation/responsive.ts', source => source.replace('MOBILE_WIDTH = 600', 'MOBILE_WIDTH = 768'));
  has(f.check(), 'RESPONSIVE_DRIFT');
});

const uiFile = 'components/foundation/app-shell.tsx';
const recordFile = 'docs/release/ui-changes/synthetic-test.json';
function record(f, overrides = {}) {
  f.write(recordFile, JSON.stringify({ baselineSha: original.baselineSha, level: 'V0', paths: [uiFile], pages: ['navigation'], visibleDifference: 'none', evidence: ['docs/DECISION_LOG.md'], ...overrides }));
}
test('undeclared UI change blocks, while this tooling/doc-only change needs no invented UI approval', t => {
  const f = fixture(t);
  has(f.check({ changedPaths: [uiFile] }), 'UI_CHANGE_UNDECLARED');
  assert.deepEqual(f.check({ changedPaths: ['scripts/check-release-baseline.mjs', 'docs/CURRENT_STATE.md'] }), []);
});

test('V0 record covers only exact changed paths and an old unchanged record cannot be reused', t => {
  const f = fixture(t); record(f);
  assert.deepEqual(f.check({ changedPaths: [uiFile, recordFile] }), []);
  has(f.check({ changedPaths: [uiFile] }), 'UI_CHANGE_UNDECLARED');
  has(f.check({ changedPaths: [uiFile, recordFile, 'app/foundation.css'] }), 'UI_CHANGE_UNDECLARED');
});

test('visible layout change cannot be declared as V0', t => {
  const f = fixture(t); record(f, { visibleDifference: 'new sidebar layout' });
  has(f.check({ changedPaths: [uiFile, recordFile] }), 'UI_CHANGE_LEVEL');
});

test('V2 and V3 require approval evidence; the guard never supplies approval', t => {
  const f = fixture(t);
  for (const level of ['V2', 'V3']) {
    record(f, { level, visibleDifference: 'synthetic layout change' });
    has(f.check({ changedPaths: [uiFile, recordFile] }), 'UI_APPROVAL_REQUIRED');
  }
});

test('CLI exits nonzero for an unknown base; it is not only a library assertion', () => {
  const result = spawnSync(process.execPath, ['scripts/check-release-baseline.mjs', '--base-sha', '0'.repeat(40)], { cwd: repository, encoding: 'utf8', timeout: 20000, windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /git_read_failed/);
});
