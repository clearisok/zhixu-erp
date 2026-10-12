import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { validateBaseline, manifestPath, cssImports, isUiPath, readEvidenceBlob } from '../scripts/check-release-baseline.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const original = JSON.parse(readFileSync(path.join(repository, manifestPath), 'utf8'));
const commits = new Set([original.baselineSha, ...original.evidence.flatMap(item => [item.recordedAtSha, item.renderedSourceSha]), ...original.runtimeSnapshots.map(item => item.sourceSha), ...original.capabilities.flatMap(item => Object.values(item.statusEvidence).map(claim => claim.sourceSha))].filter(Boolean));
const frozenBlobs = new Map(original.evidence.map(item => [`${item.recordedAtSha}:${item.path}`, readEvidenceBlob(repository, item.recordedAtSha, item.path)]));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

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
  const previousManifest = structuredClone(original), blobs = new Map(frozenBlobs), knownCommits = new Set(commits);
  const files = new Set([
    ...manifest.evidence.map(item => item.path),
    ...manifest.pages.flatMap(page => [page.routeFile, ...page.components]),
    ...[manifest.css.production, ...manifest.css.previews].flatMap(entry => [entry.entry, ...entry.styles]),
    'components/foundation/responsive.ts', 'features/quote-center/authority/quote-authority.ts',
    'docs/CURRENT_STATE.md', 'docs/AI_HANDOFF.md', 'docs/PROJECT_INDEX.md',
    'features/quote-center/server/list-preferences.ts',
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
  const check = (overrides = {}) => validateBaseline({ root, manifest, previousManifest, expectedBaseSha: original.baselineSha,
    hasCommit: value => knownCommits.has(value), readBlob: (sha, file) => blobs.get(`${sha}:${file}`) ?? null, ...overrides });
  return { root, manifest, write, edit, check, blobs, knownCommits, previousManifest };
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

test('missing status-only commit remains a blocking failure', t => {
  const f = fixture(t); f.manifest.capabilities[0].statusEvidence.implemented.sourceSha = 'f'.repeat(40);
  assert.ok(f.check().some(error => error.code === 'SOURCE_SHA' && error.detail === f.manifest.capabilities[0].id + ':implemented'));
});

test('short SHA is not accepted as a baseline identity', t => {
  const f = fixture(t); f.manifest.baselineSha = original.baselineSha.slice(0, 7);
  has(f.check(), 'SOURCE_SHA');
});

test('a status-only historical SHA remains independently required after advancing main', t => {
  const f = fixture(t);
  f.manifest.capabilities[0].statusEvidence.implemented.sourceSha = 'f'.repeat(40);
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

test('a commented old route function cannot hide a changed live allowlist', t => {
  const f = fixture(t);
  f.edit('features/quote-center/authority/quote-authority.ts', source =>
    `/*\n${source}\n*/\n${source.replace('return ["/",', 'return ["/order-center", "/",')}`);
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

test('R95-1: layout helper TS column-width changes require an impact record', t => {
  const f = fixture(t), file = 'features/quote-center/server/list-preferences.ts';
  f.edit(file, source => source.replace('styleImage: 56, styleIdentity: 156', 'styleImage: 156, styleIdentity: 356'));
  assert.equal(isUiPath(file), true);
  has(f.check({ changedPaths: [file] }), 'UI_CHANGE_UNDECLARED');
});

for (const file of ['components/foundation/sidebar-preference.ts', 'features/quote-center/model/quote-list-column-definitions.ts',
  'features/new-layout/helper.ts', 'features/new-layout/helper.js', 'public/favicon.svg', 'vite.config.ts',
  'features/ainuoke-material-progress/integration-preview/index.html']) {
  test(`UI inputs fail closed across helper extraction, assets and build config: ${file}`, t => {
    has(fixture(t).check({ changedPaths: [file] }), 'UI_CHANGE_UNDECLARED');
  });
}

for (const [label, entry] of [['production', 'app/layout.tsx'], ['preview', 'features/ainuoke-material-progress/integration-preview/main.tsx']]) {
  test(`R95-2: commented Foundation is not an import in ${label}`, t => {
    const f = fixture(t);
    f.edit(entry, source => source.replace(/^(.*import ['"].*foundation\.css['"];)[ \t]*$/m, '/*\n$1\n*/'));
    has(f.check(), 'CSS_ENTRY_ORDER');
  });
}

test('CSS AST excludes fake imports in comments/templates and type-only imports, preserves real multiline order', () => {
  const source = '/*\nimport "./fake.css";\n*/\nconst example = `\nimport "./template.css";\n`;\nimport type T from "./types.css";\nimport { type Foo } from "./named-types.css";\nimport\n "./globals.css";\nimport "./foundation.css";';
  assert.deepEqual(cssImports(source, 'app/layout.tsx'), ['app/globals.css', 'app/foundation.css']);
});

test('R95-3: replacing an acceptance document at the same path fails historical content verification', t => {
  const f = fixture(t), item = f.manifest.evidence.find(e => e.id === 'order-integration');
  f.write(item.path, '# Replacement\nNo acceptance evidence remains here.\n');
  has(f.check(), 'EVIDENCE_WORKTREE_DRIFT');
});

test('R95-4: a valid commit that predates the evidence file is not a valid evidence identity', t => {
  const f = fixture(t), item = f.manifest.evidence.find(e => e.id === 'quote-pr91');
  item.recordedAtSha = f.manifest.evidence.find(e => e.id === 'pr64-list').renderedSourceSha;
  assert.throws(() => readEvidenceBlob(repository, item.recordedAtSha, item.path), /evidence_blob_unavailable/);
  has(f.check(), 'EVIDENCE_BLOB');
  has(f.check(), 'EVIDENCE_HISTORY_CHANGED');
});

test('R95-5: changing approved PNG and its manifest hash together does not rebaseline history', t => {
  const f = fixture(t), item = f.manifest.evidence.find(e => e.kind === 'screenshot');
  const bytes = Buffer.concat([readFileSync(path.join(f.root, item.path)), Buffer.from('replacement-review-probe')]);
  f.write(item.path, bytes); item.sha256 = hash(bytes);
  const errors = f.check(); has(errors, 'EVIDENCE_BLOB_HASH'); has(errors, 'EVIDENCE_HISTORY_CHANGED');
});

test('R95-6: unimplemented Intake cannot be deployed or source-active even with matching claim labels', t => {
  const f = fixture(t), cap = f.manifest.capabilities.find(c => c.id === 'intake');
  cap.environments.trial18443 = cap.statusEvidence.trial18443.value = 'deployed-historical';
  cap.sourceActivation = cap.statusEvidence.sourceActivation.value = 'active-historical';
  cap.statusEvidence.sourceActivation.runtimeIds = ['trial18443'];
  has(f.check(), 'CAPABILITY_OVERCLAIM');
});

test('R95-7: Order cannot be promoted by changing status and claims while reusing old evidence', t => {
  const f = fixture(t), cap = f.manifest.capabilities.find(c => c.id === 'order');
  cap.implemented = cap.statusEvidence.implemented.value = 'yes';
  cap.environments.preview18444 = cap.statusEvidence.preview18444.value = 'deployed-historical';
  cap.sourceActivation = cap.statusEvidence.sourceActivation.value = 'active-historical';
  cap.statusEvidence.sourceActivation.runtimeIds = ['preview18444'];
  has(f.check(), 'STATUS_TRANSITION_EVIDENCE');
});

for (const file of ['docs/CURRENT_STATE.md', 'docs/AI_HANDOFF.md', 'docs/PROJECT_INDEX.md']) {
  test(`R95-8: empty, whitespace and missing anchor all fail for ${file}`, t => {
    const f = fixture(t);
    for (const body of ['', ' \r\n\t', '# State\nNo baseline']) {
      f.write(file, body); has(f.check(), 'STATE_BASELINE_DRIFT');
    }
  });
}

test('prior manifest is mandatory and evidence IDs cannot be deleted to evade immutable history', t => {
  const f = fixture(t);
  has(f.check({ previousManifest: undefined }), 'HISTORY_REQUIRED');
  f.manifest.evidence = f.manifest.evidence.filter(e => e.id !== 'pr64-list');
  has(f.check(), 'EVIDENCE_HISTORY_CHANGED');
});

test('v1 history can gain verified document hashes without changing historical facts', t => {
  const f = fixture(t);
  const prior = structuredClone(original);
  prior.schemaVersion = 1;
  for (const item of prior.evidence) if (item.kind === 'document') delete item.sha256;
  for (const cap of prior.capabilities) delete cap.statusEvidence;
  assert.deepEqual(f.check({ previousManifest: prior }), []);
});

function newProof(f, { id = 'new-proof', file = 'docs/new-proof.md', body = '# New synthetic scoped evidence\n' } = {}) {
  const sha = 'c'.repeat(40), bytes = Buffer.from(body);
  f.knownCommits.add(sha); f.blobs.set(`${sha}:${file}`, bytes); f.write(file, bytes);
  const item = { id, kind: 'document', path: file, recordedAtSha: sha, sha256: hash(bytes) };
  f.manifest.evidence.push(item); return item;
}

test('a documented revision preserves the frozen old blob and can be checked again in a later PR', t => {
  const f = fixture(t), old = f.manifest.evidence.find(e => e.id === 'quote-original');
  const item = newProof(f, { file: old.path, body: '# Revised current document\nOld version remains in Git.\n' });
  item.supersedes = old.id; item.changeReason = 'Synthetic forward evidence revision';
  assert.deepEqual(f.check(), []);
  assert.deepEqual(f.check({ previousManifest: structuredClone(f.manifest) }), []);
});

test('a scoped status change with genuinely new frozen document bytes is permitted', t => {
  const f = fixture(t), cap = f.manifest.capabilities.find(c => c.id === 'order'), proof = newProof(f);
  cap.implemented = cap.statusEvidence.implemented.value = 'yes';
  cap.statusEvidence.implemented.evidence = [proof.id];
  assert.deepEqual(f.check(), []);
});

test('renaming or recommitting old evidence does not justify a new capability status', t => {
  const f = fixture(t), cap = f.manifest.capabilities.find(c => c.id === 'order');
  const old = f.manifest.evidence.find(e => e.id === 'order-integration');
  const proof = newProof(f, { body: f.blobs.get(`${old.recordedAtSha}:${old.path}`).toString('utf8').replaceAll('\r\n', '\n') });
  cap.implemented = cap.statusEvidence.implemented.value = 'yes'; cap.statusEvidence.implemented.evidence = [proof.id];
  has(f.check(), 'STATUS_TRANSITION_EVIDENCE');
});

test('new screenshot evidence requires a frozen approval reference and cannot replace an existing ID', t => {
  const f = fixture(t), item = f.manifest.evidence.find(e => e.kind === 'screenshot');
  f.manifest.evidence.push({ ...item, id: 'new-screenshot' });
  has(f.check(), 'SCREENSHOT_APPROVAL');
});

test('runtime identity and capability deployment proofs must agree and need fresh evidence', t => {
  const f = fixture(t), runtime = f.manifest.runtimeSnapshots[0];
  runtime.imageId = `sha256:${'a'.repeat(64)}`;
  has(f.check(), 'STATUS_RUNTIME');
  for (const cap of f.manifest.capabilities) cap.statusEvidence.trial18443.imageId = runtime.imageId;
  has(f.check(), 'RUNTIME_TRANSITION_EVIDENCE');
});
