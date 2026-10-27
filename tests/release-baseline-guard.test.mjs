import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { validateBaseline, manifestPath, cssImports, isUiPath, readEvidenceBlob, readEvidenceBlobs } from '../scripts/check-release-baseline.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const original = JSON.parse(readFileSync(path.join(repository, manifestPath), 'utf8'));
const commits = new Set([original.baselineSha, ...original.evidence.flatMap(item => [item.recordedAtSha, item.renderedSourceSha]), ...original.runtimeSnapshots.map(item => item.sourceSha), ...original.capabilities.flatMap(item => Object.values(item.statusEvidence).map(claim => claim.sourceSha))].filter(Boolean));
const frozenBlobs = readEvidenceBlobs(repository, original.evidence);
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
  for (const directory of new Set([...files].map(file => path.dirname(path.join(root, file))))) {
    mkdirSync(directory, { recursive: true });
  }
  for (const file of files) {
    copyFileSync(path.join(repository, file), path.join(root, file));
  }
  const write = (file, value) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), value);
  };
  const edit = (file, transform) => write(file, transform(readFileSync(path.join(root, file), 'utf8')));
  const check = (overrides = {}) => validateBaseline({ root, manifest, previousManifest, expectedBaseSha: original.baselineSha,
    checkedHead:original.baselineSha, readMergeCommits:()=>[], isAncestor: (a,b) => knownCommits.has(a) && knownCommits.has(b), hasCommit: value => knownCommits.has(value), readBlob: (sha, file) => blobs.get(`${sha}:${file}`) ?? null, ...overrides });
  return { root, manifest, write, edit, check, blobs, knownCommits, previousManifest };
}
const has = (errors, code) => assert.ok(errors.some(error => error.code === code), `Expected ${code}; got ${JSON.stringify(errors)}`);

test('bulk frozen inputs retain exact Git bytes and reject unsafe or incomplete batches', async t => {
  const parent = realpathSync(tmpdir()), root = mkdtempSync(path.join(parent, 'zhixu-evidence-batch-test-'));
  t.after(() => {
    const resolved = realpathSync(root);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('zhixu-evidence-batch-test-'));
    rmSync(resolved, { recursive: true, force: true });
  });
  const git = args => {
    const result = spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false',
      '-c', 'user.name=Evidence Batch Fixture', '-c', 'user.email=evidence@example.invalid', ...args], {
      cwd: root, encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024,
    });
    assert.equal(result.status, 0, `owned_batch_git_failed:${args[0]}`);
    return result.stdout.trim();
  };
  const bytes = Buffer.from([0, 10, 13, 255, 32, 65, 0, 10]);
  mkdirSync(path.join(root, 'proofs'));
  writeFileSync(path.join(root, 'proofs', '价格 with spaces.bin'), bytes);
  writeFileSync(path.join(root, 'same.bin'), bytes);
  writeFileSync(path.join(root, 'empty.bin'), Buffer.alloc(0));
  git(['init', '-q']);
  git(['add', '--', 'proofs/价格 with spaces.bin', 'same.bin', 'empty.bin']);
  git(['commit', '-q', '-m', 'owned binary evidence']);
  const sha = git(['rev-parse', 'HEAD']);
  const record = file => ({ recordedAtSha: sha, path: file });
  await t.test('binary, empty, Unicode paths and repeated objects preserve exact identities', () => {
    const records = ['same.bin', 'empty.bin', 'proofs/价格 with spaces.bin', 'same.bin'].map(record);
    const loaded = readEvidenceBlobs(root, records);
    assert.equal(loaded.size, 3);
    for (const item of records) assert.deepEqual(loaded.get(`${sha}:${item.path}`), readEvidenceBlob(root, sha, item.path));
    assert.deepEqual(loaded.get(`${sha}:same.bin`), bytes);
    assert.equal(loaded.get(`${sha}:empty.bin`).length, 0);
  });
  await t.test('one missing path rejects the whole batch', () => {
    assert.throws(() => readEvidenceBlobs(root, [record('same.bin'), record('missing.bin')]), /evidence_blob_unavailable/);
  });
  await t.test('an unavailable commit rejects the whole batch', () => {
    assert.throws(() => readEvidenceBlobs(root, [{ ...record('same.bin'), recordedAtSha: '0'.repeat(40) }]), /evidence_blob_unavailable/);
  });
  await t.test('a tree cannot impersonate a blob', () => {
    assert.throws(() => readEvidenceBlobs(root, [record('proofs')]), /evidence_blob_unavailable/);
  });
  await t.test('path and line-protocol injection is rejected before starting Git', () => {
    for (const file of ['../outside', '/absolute', 'C:/absolute', 'back\\slash', './relative', 'empty//part', 'proof\nHEAD:other', 'proof\rHEAD:other', 'proof\0other']) {
      assert.throws(() => readEvidenceBlobs('not-an-owned-repository', [record(file)]), /invalid_evidence_blob_identity/);
    }
    assert.throws(() => readEvidenceBlobs('not-an-owned-repository', [{ ...record('same.bin'), recordedAtSha: sha.slice(0, 7) }]), /invalid_evidence_blob_identity/);
  });
  await t.test('request count and bytes are bounded before starting Git', () => {
    assert.throws(() => readEvidenceBlobs('not-an-owned-repository', Array(4097).fill(record('same.bin'))), /evidence_batch_limit/);
    assert.throws(() => readEvidenceBlobs('not-an-owned-repository', [record('a'.repeat(1024 * 1024))]), /evidence_batch_limit/);
  });
  await t.test('oversized objects are rejected before reading payloads', () => {
    writeFileSync(path.join(root, 'large.bin'), Buffer.alloc(16 * 1024 * 1024 + 1, 90));
    git(['add', '--', 'large.bin']); git(['commit', '-q', '-m', 'owned oversized evidence']);
    const recordedAtSha = git(['rev-parse', 'HEAD']);
    assert.throws(() => readEvidenceBlobs(root, [{ recordedAtSha, path: 'large.bin' }]), /evidence_batch_limit/);
  });
  await t.test('the unique payload budget accepts duplicate OIDs at 64MiB and rejects one extra object', () => {
    const files = Array.from({ length: 4 }, (_, index) => `budget-${index}.bin`);
    for (const [index, file] of files.entries()) writeFileSync(path.join(root, file), Buffer.alloc(16 * 1024 * 1024, index + 1));
    copyFileSync(path.join(root, files[0]), path.join(root, 'budget-duplicate.bin'));
    git(['add', '--', ...files, 'budget-duplicate.bin']); git(['commit', '-q', '-m', 'owned exact batch budget']);
    const recordedAtSha = git(['rev-parse', 'HEAD']);
    const records = [...files, 'budget-duplicate.bin'].map(file => ({ recordedAtSha, path: file }));
    const loaded = readEvidenceBlobs(root, records);
    assert.equal(loaded.size, 5);
    for (const [index, file] of files.entries()) assert.equal(hash(loaded.get(`${recordedAtSha}:${file}`)), hash(Buffer.alloc(16 * 1024 * 1024, index + 1)));
    assert.deepEqual(loaded.get(`${recordedAtSha}:budget-duplicate.bin`), loaded.get(`${recordedAtSha}:${files[0]}`));
    assert.throws(() => readEvidenceBlobs(root, [...records, { recordedAtSha, path: 'same.bin' }]), /evidence_batch_limit/);
  });
  await t.test('an empty batch does not require repository access', () => {
    assert.deepEqual(readEvidenceBlobs('not-an-owned-repository', []), new Map());
  });
});

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

function stackedRevision(f) {
  const old=f.manifest.evidence.find(e=>e.id==='quote-original');
  const first=newProof(f,{id:'stack-first',file:old.path,body:'# First forward revision\n'});
  first.supersedes=old.id;first.changeReason='First reviewed stage';
  const second={...first,id:'stack-second',recordedAtSha:'d'.repeat(40),supersedes:first.id,changeReason:'Second reviewed stage'};
  const bytes=Buffer.from('# Second forward revision\n');second.sha256=hash(bytes);
  f.knownCommits.add(second.recordedAtSha);f.blobs.set(`${second.recordedAtSha}:${second.path}`,bytes);f.write(second.path,bytes);f.manifest.evidence.push(second);
  return {old,first,second};
}
test('stacked evidence revisions preserve every intermediate frozen blob and base anchor',t=>{
 const f=fixture(t);stackedRevision(f);assert.deepEqual(f.check(),[]);
 assert.deepEqual(f.check({previousManifest:structuredClone(f.manifest)}),[]);
});
for(const mode of ['dangling','cycle','fork','path-drift','blob-tamper','unanchored'])test(`stacked evidence rejects ${mode}`,t=>{
 const f=fixture(t),{old,first,second}=stackedRevision(f);
 if(mode==='dangling')second.supersedes='missing-proof';
 if(mode==='cycle')first.supersedes=second.id;
 if(mode==='fork')second.supersedes=old.id;
 if(mode==='path-drift')second.path='docs/wrong-proof.md';
 if(mode==='blob-tamper')f.blobs.set(`${first.recordedAtSha}:${first.path}`,Buffer.from('tampered'));
 if(mode==='unanchored'){delete first.supersedes;delete first.changeReason;}
 has(f.check(),mode==='blob-tamper'?'EVIDENCE_BLOB_HASH':'EVIDENCE_REVISION');
});
function addCheckpointRevision(f, parent, id, sha) {
  const body=Buffer.from(`Synthetic checkpoint ${id}\n`);
  const item={...parent,id,recordedAtSha:sha,sha256:hash(body),supersedes:parent.id,changeReason:'Explicit same-PR checkpoint revision'};
  delete item.mergeOf;
  f.manifest.evidence.push(item);f.knownCommits.add(sha);f.blobs.set(`${sha}:${item.path}`,body);f.write(item.path,body);
  return item;
}
test('same-PR document checkpoint chain keeps every frozen blob and anchors to the real base',t=>{
  const f=fixture(t),old=[...f.manifest.evidence].reverse().find(item=>item.kind==='document');
  const first=addCheckpointRevision(f,old,'checkpoint-one','d'.repeat(40));
  addCheckpointRevision(f,first,'checkpoint-two','e'.repeat(40));
  assert.deepEqual(f.check(),[]);
  f.blobs.delete(`${first.recordedAtSha}:${first.path}`);
  has(f.check(),'EVIDENCE_BLOB');
});
test('same-PR revision cycles, unanchored chains and forks cannot bypass frozen evidence',t=>{
  for(const mode of ['cycle','unanchored','fork']){
    const f=fixture(t),old=[...f.manifest.evidence].reverse().find(item=>item.kind==='document');
    const first=addCheckpointRevision(f,old,'checkpoint-one','d'.repeat(40));
    const second=addCheckpointRevision(f,first,'checkpoint-two','e'.repeat(40));
    if(mode==='cycle')first.supersedes=second.id;
    if(mode==='unanchored')delete first.supersedes;
    if(mode==='fork')second.supersedes=old.id;
    has(f.check(),'EVIDENCE_REVISION');
  }
});

test('successive document revisions in one PR preserve a linear frozen chain', t => {
  const f=fixture(t),old=f.manifest.evidence.find(e=>e.id==='quote-original');
  const first=newProof(f,{id:'chain-one',file:old.path,body:'# First forward version\n'});
  first.supersedes=old.id;first.changeReason='First change';
  const bytes=Buffer.from('# Second forward version\n'),sha='d'.repeat(40);
  f.knownCommits.add(sha);f.blobs.set(`${sha}:${old.path}`,bytes);f.write(old.path,bytes);
  f.manifest.evidence.push({id:'chain-two',kind:'document',path:old.path,recordedAtSha:sha,sha256:hash(bytes),supersedes:first.id,changeReason:'Second change'});
  assert.deepEqual(f.check(),[]);assert.deepEqual(f.check({previousManifest:structuredClone(f.manifest)}),[]);
  first.sha256='0'.repeat(64);has(f.check(),'EVIDENCE_BLOB_HASH');
});
for(const corruption of ['cycle','orphan','fork','same-commit','wrong-path','wrong-kind'])test(`forward document chain rejects ${corruption}`,t=>{
  const f=fixture(t),old=f.manifest.evidence.find(e=>e.id==='quote-original');
  const first=newProof(f,{id:'chain-one',file:old.path,body:'# First forward version\n'});first.supersedes=old.id;first.changeReason='First change';
  const bytes=Buffer.from('# Second forward version\n'),sha='d'.repeat(40);
  f.knownCommits.add(sha);f.blobs.set(`${sha}:${old.path}`,bytes);f.write(old.path,bytes);
  const second={id:'chain-two',kind:'document',path:old.path,recordedAtSha:sha,sha256:hash(bytes),supersedes:first.id,changeReason:'Second change'};f.manifest.evidence.push(second);
  if(corruption==='cycle')first.supersedes=second.id;
  if(corruption==='orphan')second.supersedes='missing-parent';
  if(corruption==='fork')second.supersedes=old.id;
  if(corruption==='same-commit')second.recordedAtSha=first.recordedAtSha;
  if(corruption==='wrong-path')second.path='docs/other.md';
  if(corruption==='wrong-kind')second.kind='screenshot';
  has(f.check(),'EVIDENCE_REVISION');
});

for (const corruption of ['unrelated-sha','new-root','second-leaf','deleted-middle','self','array-order']) test(`document revision chain handles ${corruption}`, t => {
 const f=fixture(t),old=f.manifest.evidence.find(e=>e.id==='quote-original');
 const first=newProof(f,{id:'chain-one',file:old.path,body:'# First forward version\n'});first.supersedes=old.id;first.changeReason='First change';
 if(corruption==='unrelated-sha')has(f.check({isAncestor:()=>false}),'EVIDENCE_REVISION_ANCESTRY');
 if(corruption==='new-root'){first.supersedes='new-root';const root={...first,id:'new-root'};delete root.supersedes;f.manifest.evidence.push(root);has(f.check(),'EVIDENCE_REVISION_ANCHOR');}
 if(corruption==='second-leaf'){f.manifest.evidence.push({...first,id:'second-leaf',supersedes:undefined});has(f.check(),'EVIDENCE_REVISION_LEAF');}
 if(corruption==='deleted-middle'){first.supersedes='deleted-middle';has(f.check(),'EVIDENCE_REVISION');}
 if(corruption==='self'){first.supersedes=first.id;has(f.check(),'EVIDENCE_REVISION');}
 if(corruption==='array-order'){f.manifest.evidence.reverse();assert.deepEqual(f.check(),[]);}
});

test('sibling branch sharing main cannot supply a new frozen revision',t=>{const f=fixture(t),old=f.manifest.evidence.find(e=>e.id==='quote-original');const added=newProof(f,{id:'sibling-revision',file:old.path,body:'# Other branch version\n'});added.supersedes=old.id;added.changeReason='Different branch';has(f.check({checkedHead:'e'.repeat(40),isAncestor:(a,b)=>a===original.baselineSha&&b===added.recordedAtSha}),'EVIDENCE_REVISION_ANCESTRY');});

function screenshotRevisions(f) {
  const old = f.manifest.evidence.find(item => item.kind === 'screenshot');
  const bytes = f.blobs.get(`${old.recordedAtSha}:${old.path}`);
  const approval = f.manifest.evidence.find(item => item.kind === 'document').id;
  const add = (parent, id, sha) => {
    const item = { ...old, id, path: `artifacts/${id}.png`, recordedAtSha: sha,
      supersedes: parent.id, changeReason: 'Synthetic approved screenshot replacement', approvalEvidence: approval };
    f.manifest.evidence.push(item); f.knownCommits.add(sha);
    f.blobs.set(`${sha}:${item.path}`, bytes); f.write(item.path, bytes);
    return item;
  };
  const first = add(old, 'screenshot-first', 'c'.repeat(40));
  return { old, first, second: add(first, 'screenshot-second', 'd'.repeat(40)) };
}

test('approved screenshot replacements preserve the original single-parent base anchor', t => {
  const f = fixture(t); screenshotRevisions(f);
  assert.deepEqual(f.check(), []);
  assert.deepEqual(f.check({ previousManifest: structuredClone(f.manifest) }), []);
});

for (const mode of ['cycle', 'unanchored', 'merge']) test(`screenshot revisions reject ${mode}`, t => {
  const f = fixture(t), { old, first, second } = screenshotRevisions(f);
  if (mode === 'cycle') first.supersedes = second.id;
  if (mode === 'unanchored') delete first.supersedes;
  if (mode === 'merge') { delete second.supersedes; second.mergeOf = [old.id, first.id]; }
  has(f.check(), 'EVIDENCE_REVISION');
});

function realEvidenceMerge(t, { preBaseSide = false } = {}) {
  const f=fixture(t),legacyCommits=new Set(f.knownCommits),old=f.manifest.evidence.find(e=>e.id==='quote-original');
  const git=(args,allowed=[0])=>{
    const result=spawnSync('git',['-c','core.autocrlf=false','-c','commit.gpgsign=false','-c','user.name=Evidence Fixture','-c','user.email=evidence@example.invalid',...args],{cwd:f.root,encoding:'utf8',windowsHide:true,timeout:15000});
    assert.ok(allowed.includes(result.status),`owned_fixture_git_failed:${args[0]}`);return result.stdout.trim();
  };
  const saveManifest=m=>f.write(manifestPath,JSON.stringify(m,null,2)+'\n');
  const commit=(message,files)=>{git(['add','--',...files]);git(['commit','-q','-m',message]);return git(['rev-parse','HEAD']);};
  const sidePath='docs/left-only-proof.md',sideBytes=Buffer.from('# Side-branch evidence must survive\n');
  git(['init','-q','--initial-branch=main']);
  let preBaseSha;
  if(preBaseSide){f.write(sidePath,sideBytes);preBaseSha=commit('document blob before the actual baseline',[sidePath]);}
  saveManifest(f.manifest);
  const base=commit('synthetic frozen baseline',[manifestPath,old.path]);
  git(['switch','-q','-c','left']);
  const leftBytes=Buffer.from('# Left reviewed version\n');
  f.write(old.path,leftBytes);f.write(sidePath,sideBytes);
  const leftSha=commit('left document',[old.path,sidePath]);
  const left={id:'real-left',kind:'document',path:old.path,recordedAtSha:leftSha,sha256:hash(leftBytes),supersedes:old.id,changeReason:'Left reviewed change'};
  const side={id:'real-side-proof',kind:'document',path:sidePath,recordedAtSha:preBaseSha??leftSha,sha256:hash(sideBytes)};
  const leftManifest=structuredClone(f.manifest);leftManifest.evidence.push(left,side);saveManifest(leftManifest);
  const leftHead=commit('freeze left evidence',[manifestPath]);
  git(['switch','-q','main']);git(['switch','-q','-c','right']);
  const rightBytes=Buffer.from('# Right reviewed version\n');f.write(old.path,rightBytes);
  const rightSha=commit('right document',[old.path]);
  const right={id:'real-right',kind:'document',path:old.path,recordedAtSha:rightSha,sha256:hash(rightBytes),supersedes:old.id,changeReason:'Right reviewed change'};
  const rightManifest=structuredClone(f.manifest);rightManifest.evidence.push(right);saveManifest(rightManifest);
  const rightHead=commit('freeze right evidence',[manifestPath]);
  git(['merge','--no-ff','--no-commit','left'],[1]);
  const mergedBytes=Buffer.from('# Reviewed union of both versions\n');f.write(old.path,mergedBytes);
  const union=structuredClone(f.manifest);union.evidence.push(left,side,right);saveManifest(union);
  const mergedSha=commit('resolve both real branches',[old.path,sidePath,manifestPath]);
  const merged={id:'real-merged',kind:'document',path:old.path,recordedAtSha:mergedSha,sha256:hash(mergedBytes),mergeOf:[left.id,right.id],changeReason:'Reviewed real branch reconciliation'};
  f.manifest.evidence=union.evidence.concat(merged);
  const normalize=sha=>legacyCommits.has(sha)?base:sha;
  const commitCache=new Map(),ancestryCache=new Map(),blobCache=new Map(),parentCache=new Map();
  const options={
    checkedHead:mergedSha,
    readMergeCommits:(baseSha,head)=>git(['rev-list','--ancestry-path','--min-parents=2','--max-count=257',`${normalize(baseSha)}..${normalize(head)}`]).split('\n').filter(Boolean),
    hasCommit:sha=>{if(legacyCommits.has(sha))return true;if(!commitCache.has(sha))commitCache.set(sha,spawnSync('git',['cat-file','-e',`${sha}^{commit}`],{cwd:f.root,stdio:'ignore',windowsHide:true}).status===0);return commitCache.get(sha);},
    isAncestor:(a,b)=>{const key=`${normalize(a)}:${normalize(b)}`;if(!ancestryCache.has(key))ancestryCache.set(key,spawnSync('git',['merge-base','--is-ancestor',normalize(a),normalize(b)],{cwd:f.root,stdio:'ignore',windowsHide:true}).status===0);return ancestryCache.get(key);},
    readBlob:(sha,file)=>{const key=`${sha}:${file}`;if(f.blobs.has(key))return f.blobs.get(key);if(!blobCache.has(key)){const r=spawnSync('git',['show',`${sha}:${file}`],{cwd:f.root,windowsHide:true,maxBuffer:8*1024*1024});blobCache.set(key,r.status===0?r.stdout:null);}return blobCache.get(key);},
    readCommitParents:sha=>{if(!parentCache.has(sha))parentCache.set(sha,git(['rev-list','--parents','-n','1',sha]).split(' ').slice(1));return parentCache.get(sha);},
  };
  return {f,git,commit,options,base,old,left,right,side,merged,mergedBytes,leftHead,rightHead};
}

function postBaseDocumentRevision(t, options) {
  const s = realEvidenceMerge(t, options), { f, commit } = s;
  const save = () => f.write(manifestPath, JSON.stringify(f.manifest, null, 2) + '\n');
  save();
  const anchorHead = commit('freeze original post-base root before its revision', [manifestPath]);
  const body = Buffer.from('# Explicit forward revision of a post-base document\n');
  f.write(s.side.path, body);
  const sourceSha = commit('revise post-base document on its actual branch', [s.side.path]);
  const revised = { ...s.side, id: 'post-base-first', recordedAtSha: sourceSha, sha256: hash(body),
    supersedes: s.side.id, changeReason: 'Preserve the committed original root while updating its current document' };
  f.manifest.evidence.push(revised);
  return { ...s, save, anchorHead, sourceSha, revised, options: { ...s.options, checkedHead: sourceSha } };
}

test('post-base document roots can be revised through committed linear checkpoints', t => {
  const s = postBaseDocumentRevision(t), { f } = s;
  assert.deepEqual(f.check(s.options), []);
  s.save(); s.commit('freeze first post-base successor', [manifestPath]);
  const body = Buffer.from('# Second explicit revision preserves both earlier blobs\n');
  f.write(s.side.path, body);
  const sourceSha = s.commit('second post-base document update', [s.side.path]);
  f.manifest.evidence.push({ ...s.revised, id: 'post-base-second', recordedAtSha: sourceSha, sha256: hash(body),
    supersedes: s.revised.id, changeReason: 'Second committed linear revision' });
  assert.deepEqual(f.check({ ...s.options, checkedHead: sourceSha }), []);
});

test('post-base revisions require their own frozen predecessor, not an earlier revision anchor', t => {
  const s = postBaseDocumentRevision(t), { f } = s;
  // The first revision is deliberately not frozen into any Git manifest.
  const body = Buffer.from('# A later revision cannot retroactively freeze its predecessor\n');
  f.write(s.side.path, body);
  const sourceSha = s.commit('second update before freezing the first revision', [s.side.path]);
  f.manifest.evidence.push({ ...s.revised, id: 'post-base-unfrozen-second', recordedAtSha: sourceSha, sha256: hash(body),
    supersedes: s.revised.id, changeReason: 'Negative control: both records added after both source commits' });
  const errors = f.check({ ...s.options, checkedHead: sourceSha });
  assert.ok(errors.some(error => error.code === 'EVIDENCE_REVISION_ANCHOR' && error.detail === 'post-base-unfrozen-second'), JSON.stringify(errors));
});

test('post-base revision lineage cannot use a real source commit before the actual baseline', t => {
  const s = postBaseDocumentRevision(t, { preBaseSide: true });
  assert.equal(s.options.isAncestor(s.base, s.side.recordedAtSha), false);
  assert.equal(s.options.isAncestor(s.side.recordedAtSha, s.anchorHead), true);
  has(s.f.check(s.options), 'EVIDENCE_REVISION_ANCHOR');
});

test('post-base later revisions reject their own missing or rewritten parent witnesses', async t => {
  const s = postBaseDocumentRevision(t), { f } = s;
  s.save(); const parent = s.commit('freeze first revision before own-witness negative controls', [manifestPath]);
  const committed = JSON.parse(s.options.readBlob(parent, manifestPath).toString('utf8'));
  const body = Buffer.from('# Later source with a separately required parent witness\n');
  f.write(s.side.path, body);
  const sourceSha = s.commit('later source for own-witness negative controls', [s.side.path]);
  const id = 'post-base-own-witness-second';
  f.manifest.evidence.push({ ...s.revised, id, recordedAtSha: sourceSha, sha256: hash(body),
    supersedes: s.revised.id, changeReason: 'The current revision must prove its own immediate parent' });
  for (const mode of ['missing', 'malformed', 'missing-predecessor', 'rewritten-other-history', 'merge-source']) {
    await t.test(mode, () => {
      let bytes = Buffer.from(JSON.stringify(committed));
      if (mode === 'missing') bytes = null;
      if (mode === 'malformed') bytes = Buffer.from('{invalid');
      if (mode === 'missing-predecessor') bytes = Buffer.from(JSON.stringify({ ...committed,
        evidence: committed.evidence.filter(item => item.id !== s.revised.id) }));
      if (mode === 'rewritten-other-history') { const modified = structuredClone(committed); modified.evidence[0].sha256 = '0'.repeat(64); bytes = Buffer.from(JSON.stringify(modified)); }
      const options = { ...s.options, checkedHead: sourceSha,
        readBlob: (sha, file) => sha === parent && file === manifestPath ? bytes : s.options.readBlob(sha, file),
        readCommitParents: sha => mode === 'merge-source' && sha === sourceSha ? [parent, s.rightHead] : s.options.readCommitParents(sha) };
      const errors = f.check(options);
      assert.ok(errors.some(error => error.code === 'EVIDENCE_REVISION_ANCHOR' && error.detail === id), JSON.stringify(errors));
    });
  }
});

test('post-base branches with their own checkpoints retain real merge reconciliation', t => {
  const s = postBaseDocumentRevision(t), { f } = s;
  const left = s.revised;
  s.save(); const leftHead = s.commit('freeze post-base left successor', [manifestPath]);
  s.git(['switch', '-q', '-c', 'post-base-right', s.anchorHead]);
  f.manifest.evidence = f.manifest.evidence.filter(item => item.id !== left.id);
  const rightBody = Buffer.from('# Parallel right successor of the committed post-base root\n');
  f.write(s.side.path, rightBody);
  const rightSha = s.commit('parallel post-base right source', [s.side.path]);
  const right = { ...left, id: 'post-base-right', recordedAtSha: rightSha, sha256: hash(rightBody), changeReason: 'Parallel independently frozen right revision' };
  f.manifest.evidence.push(right); s.save(); s.commit('freeze post-base right successor', [manifestPath]);
  s.git(['merge', '--no-ff', '--no-commit', leftHead], [1]);
  const body = Buffer.from('# Explicit reconciliation of independently frozen post-base revisions\n');
  f.write(s.side.path, body); f.manifest.evidence.push(left); s.save();
  const sourceSha = s.commit('resolve real post-base revision branches', [manifestPath, s.side.path]);
  const merged = { ...left, id: 'post-base-merged', recordedAtSha: sourceSha, sha256: hash(body), mergeOf: [left.id, right.id], changeReason: 'Retain both actual post-base branch histories' };
  delete merged.supersedes;
  f.manifest.evidence.push(merged);
  assert.deepEqual(f.check({ ...s.options, checkedHead: sourceSha }), []);
});

test('post-base shared DAG validation visits each predecessor once per checkpoint', t => {
  const f = fixture(t), legacy = new Set(f.knownCommits), graph = new Map(), base = original.baselineSha;
  const file = 'docs/shared-post-base-checkpoint.md';
  graph.set(base, []);
  let next = 0;
  const commit = parents => { const sha = 'd' + (++next).toString(16).padStart(39, '0'); graph.set(sha, parents); return sha; };
  const record = (id, parents, edges) => {
    const sha = commit(parents), bytes = Buffer.from('# ' + id + '\n');
    f.blobs.set(`${sha}:${file}`, bytes);
    return { id, kind: 'document', path: file, recordedAtSha: sha, sha256: hash(bytes), ...edges };
  };
  const freeze = (source, records) => {
    const sha = commit([source]);
    f.blobs.set(`${sha}:${manifestPath}`, Buffer.from(JSON.stringify({ ...f.manifest, evidence: records })));
    return sha;
  };
  const root = record('shared-root', [base], {});
  let history = [...f.manifest.evidence, root], previous = root, parent = freeze(root.recordedAtSha, history);
  // Eight valid diamonds have 25 unique predecessor records but 256 paths to
  // their shared root. Parent manifests and ancestry model actual branch merges.
  for (let round = 0; round < 8; round++) {
    const edges = { supersedes: previous.id, changeReason: 'Independently frozen parallel revision' };
    const left = record(`shared-left-${round}`, [parent], edges), leftHead = freeze(left.recordedAtSha, [...history, left]);
    const right = record(`shared-right-${round}`, [parent], edges), rightHead = freeze(right.recordedAtSha, [...history, right]);
    const merged = record(`shared-merge-${round}`, [leftHead, rightHead], { mergeOf: [left.id, right.id], changeReason: 'Real two-parent shared lineage' });
    history = [...history, left, right, merged]; previous = merged; parent = freeze(merged.recordedAtSha, history);
  }
  const final = record('shared-final', [parent], { supersedes: previous.id, changeReason: 'Validate the shared lineage with a bounded traversal' });
  f.manifest.evidence = [...history, final];
  f.write(file, f.blobs.get(`${final.recordedAtSha}:${file}`));
  const normalize = sha => legacy.has(sha) ? base : sha;
  const ancestry = new Map();
  const ancestor = (a, b) => {
    a = normalize(a); b = normalize(b);
    const key = `${a}:${b}`;
    if (!ancestry.has(key)) {
      const pending = [b], visited = new Set(); let found = false;
      while (pending.length) { const sha = pending.pop(); if (sha === a) { found = true; break; }
        if (!visited.has(sha)) { visited.add(sha); pending.push(...(graph.get(sha) ?? [])); } }
      ancestry.set(key, found);
    }
    return ancestry.get(key);
  };
  let rootVisits = 0;
  const errors = f.check({ checkedHead: final.recordedAtSha,
    hasCommit: sha => legacy.has(sha) || graph.has(sha),
    isAncestor: (a, b) => { if (a === root.recordedAtSha && b === parent) rootVisits++; return ancestor(a, b); },
    readCommitParents: sha => graph.get(sha) ?? [],
    readMergeCommits: () => [...graph].filter(([sha, parents]) => parents.length > 1 && ancestor(sha, final.recordedAtSha)).map(([sha]) => sha) });
  assert.deepEqual(errors, []);
  assert.equal(rootVisits, 1, 'The final checkpoint must memoize its shared predecessor; paths must not multiply validation work');
});

test('post-base document checkpoint anchors reject missing, rewritten and forged histories', async t => {
  const s = postBaseDocumentRevision(t), { f } = s;
  const current = structuredClone(f.manifest), prior = structuredClone(f.previousManifest);
  const committed = JSON.parse(s.options.readBlob(s.anchorHead, manifestPath).toString('utf8'));
  const parentRead = transform => ({ ...s.options, readBlob: (sha, file) => sha === s.anchorHead && file === manifestPath
    ? transform(structuredClone(committed)) : s.options.readBlob(sha, file) });
  const encoded = value => Buffer.from(JSON.stringify(value));
  for (const mode of ['missing', 'malformed', 'missing-root', 'rewritten-root', 'rewritten-other-history', 'merge-parent', 'outside-base', 'future-predecessor', 'cycle', 'base-path-root', 'missing-blob', 'tampered-blob']) {
    await t.test(mode, () => {
      Object.assign(f.manifest, structuredClone(current)); Object.assign(f.previousManifest, structuredClone(prior));
      let options = s.options;
      if (mode === 'missing') options = parentRead(() => null);
      if (mode === 'malformed') options = parentRead(() => Buffer.from('{not-json'));
      if (mode === 'missing-root') options = parentRead(m => { m.evidence = m.evidence.filter(item => item.id !== s.side.id); return encoded(m); });
      if (mode === 'rewritten-root') options = parentRead(m => { m.evidence.find(item => item.id === s.side.id).sha256 = '0'.repeat(64); return encoded(m); });
      if (mode === 'rewritten-other-history') options = parentRead(m => { m.evidence[0].sha256 = '0'.repeat(64); return encoded(m); });
      if (mode === 'merge-parent') options = { ...s.options, readCommitParents: sha => sha === s.sourceSha ? [s.anchorHead, s.rightHead] : s.options.readCommitParents(sha) };
      if (mode === 'outside-base') options = { ...s.options, isAncestor: (a, b) => b === s.anchorHead && a === original.baselineSha ? false : s.options.isAncestor(a, b) };
      if (mode === 'missing-blob' || mode === 'tampered-blob') options = { ...s.options, readBlob: (sha, file) => sha === s.side.recordedAtSha && file === s.side.path
        ? mode === 'missing-blob' ? null : Buffer.from('tampered original document') : s.options.readBlob(sha, file) };
      if (mode === 'future-predecessor') {
        f.manifest.evidence.find(item => item.id === s.side.id).recordedAtSha = s.sourceSha;
        options = parentRead(m => { m.evidence.find(item => item.id === s.side.id).recordedAtSha = s.sourceSha; return encoded(m); });
      }
      if (mode === 'cycle') {
        f.manifest.evidence.find(item => item.id === s.side.id).supersedes = s.revised.id;
        options = parentRead(m => { m.evidence.find(item => item.id === s.side.id).supersedes = s.revised.id; return encoded(m); });
      }
      if (mode === 'base-path-root') {
        const body = Buffer.from('# Existing base evidence cannot be replaced by a new root\n');
        const old = { id: 'post-base-path-original-main', kind: 'document', path: s.side.path, recordedAtSha: original.baselineSha, sha256: hash(body) };
        f.previousManifest.evidence.push(old); f.manifest.evidence.push(old); f.blobs.set(`${old.recordedAtSha}:${old.path}`, body);
      }
      has(f.check(options), mode === 'missing-blob' ? 'EVIDENCE_BLOB' : mode === 'tampered-blob' ? 'EVIDENCE_BLOB_HASH' : 'EVIDENCE_REVISION_ANCHOR');
    });
  }
});

function advancedMainEvidenceMerge(t, doubleSided = false) {
  const s = realEvidenceMerge(t), { f, git, commit } = s;
  const save = () => f.write(manifestPath, JSON.stringify(f.manifest, null, 2) + '\n');
  save();
  const sourceHead = commit('freeze complete side history before main advances', [manifestPath]);
  git(['switch', '-q', 'main']);
  git(['switch', '-q', '-c', 'tool-change']);
  const toolPath = 'docs/synthetic-tool-only.md';
  f.write(toolPath, '# Independent tool change\n');
  let mainProof;
  if (doubleSided) {
    const bytes = Buffer.from('# Independent main document change\n');
    f.write(s.old.path, bytes);
    const sha = commit('main document checkpoint', [toolPath, s.old.path]);
    mainProof = { id: 'advanced-main-proof', kind: 'document', path: s.old.path,
      recordedAtSha: sha, sha256: hash(bytes), supersedes: s.old.id, changeReason: 'Independent main review' };
    const mainManifest = structuredClone(f.previousManifest);
    mainManifest.evidence.push(mainProof);
    f.write(manifestPath, JSON.stringify(mainManifest, null, 2) + '\n');
    commit('freeze main proof', [manifestPath]);
  } else commit('independent tool only', [toolPath]);
  git(['switch', '-q', 'main']);
  git(['merge', '--no-ff', '-m', 'advance actual main with independent tool', 'tool-change']);
  const actualBase = git(['rev-parse', 'HEAD']);
  const baseManifest = JSON.parse(git(['show', `${actualBase}:${manifestPath}`]));
  git(['switch', '-q', 'right']);
  git(['merge', '--no-ff', '--no-commit', 'main'], doubleSided ? [1] : [0]);
  if (mainProof) f.manifest.evidence.push(mainProof);
  f.manifest.baselineSha = actualBase;
  const bytes = doubleSided ? Buffer.from('# Explicit union of side and new main\n') : s.mergedBytes;
  f.write(s.old.path, bytes);
  for (const file of ['docs/CURRENT_STATE.md', 'docs/AI_HANDOFF.md', 'docs/PROJECT_INDEX.md']) {
    f.edit(file, text => text.replaceAll(original.baselineSha, actualBase));
  }
  save();
  const integrationSha = commit('forward integrate exact advanced main', [manifestPath, s.old.path,
    'docs/CURRENT_STATE.md', 'docs/AI_HANDOFF.md', 'docs/PROJECT_INDEX.md']);
  const witness = { id: 'advanced-main-integration-witness', kind: 'document', path: s.old.path,
    recordedAtSha: integrationSha, sha256: hash(bytes), changeReason: 'Preserve frozen side history while integrating exact current main' };
  if (doubleSided) witness.mergeOf = [s.merged.id, mainProof.id];
  else witness.supersedes = s.merged.id;
  f.manifest.evidence.push(witness);
  const options = { ...s.options, expectedBaseSha: actualBase, historyBaseSha: actualBase,
    previousManifest: baseManifest, checkedHead: integrationSha,
    readMergeCommits: (base, head) => git(['rev-list', '--ancestry-path', '--min-parents=2',
      '--max-count=257', `${base}..${head}`]).split('\n').filter(Boolean) };
  assert.equal(options.isAncestor(actualBase, s.merged.recordedAtSha), false);
  assert.equal(options.isAncestor(actualBase, integrationSha), true);
  assert.equal(options.isAncestor(s.merged.recordedAtSha, integrationSha), true);
  return { ...s, options, actualBase, baseManifest, sourceHead, integrationSha, witness, bytes, save };
}

function assertOversizedParentsDoNotReadObjects(s) {
  for (const count of [9, 10000]) {
    const parents = Array.from({ length: count }, (_, index) => (index + 1).toString(16).padStart(40, '0'));
    const identities = new Set(parents), calls = [];
    has(s.f.check({ ...s.options,
      readCommitParents: sha => sha === s.integrationSha ? parents : s.options.readCommitParents(sha),
      hasCommit: sha => { if (identities.has(sha)) { calls.push('object'); return true; } return s.options.hasCommit(sha); },
      isAncestor: (a, b) => { if (identities.has(a) || identities.has(b)) { calls.push('ancestry'); return true; } return s.options.isAncestor(a, b); },
      readBlob: (sha, file) => { if (identities.has(sha)) calls.push('blob'); return s.options.readBlob(sha, file); },
    }), 'EVIDENCE_INTEGRATION_LIMIT');
    assert.deepEqual(calls, [], 'parent limit must run before object, ancestry or manifest reads');
  }
}

for (const doubleSided of [false, true]) test(`main advancement preserves ${doubleSided ? 'both document branches' : 'single-side frozen history'} with a real integration witness`, t => {
  const s = advancedMainEvidenceMerge(t, doubleSided);
  assert.deepEqual(s.f.check(s.options), []);
  assertOversizedParentsDoNotReadObjects(s);
});

test('forward integration corridor retains side-only history even after a later ordinary checkpoint', async t => {
  const s = advancedMainEvidenceMerge(t), { f } = s;
  const valid = structuredClone(f.manifest);
  await t.test('dropping a different-path source-parent proof is rejected', () => {
    f.manifest.evidence = valid.evidence.filter(item => item.id !== s.side.id);
    has(f.check(s.options), 'EVIDENCE_INTEGRATION_HISTORY_CHANGED');
    Object.assign(f.manifest, structuredClone(valid));
  });
  await t.test('changing a different-path source-parent proof is rejected', () => {
    f.manifest.evidence.find(item => item.id === s.side.id).changeReason = 'silently replaced';
    has(f.check(s.options), 'EVIDENCE_INTEGRATION_HISTORY_CHANGED');
    Object.assign(f.manifest, structuredClone(valid));
  });
  const body = Buffer.from('# Ordinary checkpoint cannot erase source evidence\n');
  f.write(s.old.path, body);
  const later = s.commit('ordinary checkpoint after actual integration', [s.old.path]);
  await t.test('a later ordinary record cannot launder all source-parent records', () => {
    Object.assign(f.manifest, structuredClone(s.baseManifest), { baselineSha: s.actualBase });
    f.manifest.evidence.push({ id: 'post-merge-ordinary-proof', kind: 'document', path: s.old.path,
      recordedAtSha: later, sha256: hash(body), supersedes: s.old.id, changeReason: 'Later ordinary checkpoint' });
    has(f.check({ ...s.options, checkedHead: later }), 'EVIDENCE_INTEGRATION_HISTORY_CHANGED');
  });
  await t.test('omitting all new records cannot hide actual source-parent history', () => {
    Object.assign(f.manifest, structuredClone(s.baseManifest), { baselineSha: s.actualBase });
    f.write(s.old.path, f.blobs.get(`${s.old.recordedAtSha}:${s.old.path}`));
    has(f.check({ ...s.options, checkedHead: later }), 'EVIDENCE_INTEGRATION_HISTORY_CHANGED');
  });
});

test('main advancement requires exact Git integration, complete parents and bounded discovery', async t => {
  const s = advancedMainEvidenceMerge(t), { f } = s;
  const valid = structuredClone(f.manifest);
  await t.test('old side history needs its explicit same-path witness', () => {
    f.manifest.evidence = f.manifest.evidence.filter(item => item.id !== s.witness.id);
    has(f.check(s.options), 'EVIDENCE_REVISION_ANCESTRY');
    Object.assign(f.manifest, structuredClone(valid));
  });
  await t.test('an unrelated later ordinary checkpoint is not that witness', () => {
    f.write('docs/ordinary-after-forward.md', '# Ordinary post-integration change\n');
    const later = s.commit('ordinary commit cannot impersonate integration witness', ['docs/ordinary-after-forward.md']);
    f.manifest.evidence.find(item => item.id === s.witness.id).recordedAtSha = later;
    has(f.check({ ...s.options, checkedHead: later }), 'EVIDENCE_REVISION_ANCESTRY');
    Object.assign(f.manifest, structuredClone(valid));
  });
  await t.test('unmerged actual main or evidence cannot borrow the integration', () => {
    has(f.check({ ...s.options, checkedHead: s.sourceHead }), 'EVIDENCE_INTEGRATION_ANCESTRY');
    has(f.check({ ...s.options, isAncestor: (a, b) => a === s.merged.recordedAtSha && b === s.sourceHead ? false : s.options.isAncestor(a, b) }), 'EVIDENCE_REVISION_ANCESTRY');
  });
  await t.test('missing or malformed source-parent manifest is not empty history', () => {
    for (const replacement of [null, Buffer.from('not-json')]) {
      has(f.check({ ...s.options, readBlob: (sha, file) => sha === s.sourceHead && file === manifestPath ? replacement : s.options.readBlob(sha, file) }), 'EVIDENCE_INTEGRATION_HISTORY');
    }
  });
  await t.test('source must actually contain the imported immutable record', () => {
    const parent = JSON.parse(s.options.readBlob(s.sourceHead, manifestPath).toString('utf8'));
    parent.evidence = parent.evidence.filter(item => item.id !== s.merged.id);
    has(f.check({ ...s.options, readBlob: (sha, file) => sha === s.sourceHead && file === manifestPath ? Buffer.from(JSON.stringify(parent)) : s.options.readBlob(sha, file) }), 'EVIDENCE_REVISION_ANCESTRY');
  });
  await t.test('malformed parent evidence is a closed history error', () => {
    const malformed = Buffer.from(JSON.stringify({ schemaVersion: 2, repository: original.repository, evidence: [null] }));
    has(f.check({ ...s.options, readBlob: (sha, file) => sha === s.sourceHead && file === manifestPath ? malformed : s.options.readBlob(sha, file) }), 'EVIDENCE_INTEGRATION_HISTORY_CHANGED');
  });
  await t.test('wrong or missing actual parents reject a pseudo integration', () => {
    has(f.check({ ...s.options, readCommitParents: sha => sha === s.integrationSha ? [s.sourceHead, s.base] : s.options.readCommitParents(sha) }), 'EVIDENCE_INTEGRATION_COMMIT');
    has(f.check({ ...s.options, readCommitParents: () => [] }), 'EVIDENCE_INTEGRATION_COMMIT');
  });
  await t.test('discovery failures, foreign merges and duplicate entries fail closed', () => {
    has(f.check({ ...s.options, readMergeCommits: () => { throw new Error('synthetic discovery failure'); } }), 'EVIDENCE_INTEGRATION_HISTORY');
    has(f.check({ ...s.options, readMergeCommits: () => [s.merged.recordedAtSha] }), 'EVIDENCE_INTEGRATION_COMMIT');
    has(f.check({ ...s.options, readMergeCommits: () => [s.integrationSha, s.integrationSha] }), 'EVIDENCE_INTEGRATION_COMMIT');
  });
  await t.test('a count or parent limit never turns a truncated history into PASS', () => {
    has(f.check({ ...s.options, readMergeCommits: () => Array(257).fill(s.integrationSha) }), 'EVIDENCE_INTEGRATION_LIMIT');
    const ancestors = s.git(['rev-list', s.integrationSha]).split('\n').filter(sha => sha !== s.integrationSha && sha !== s.actualBase);
    const parents = [s.actualBase, ...ancestors.slice(0, 8)];
    assert.equal(parents.length, 9);
    has(f.check({ ...s.options, readCommitParents: sha => sha === s.integrationSha ? parents : s.options.readCommitParents(sha) }), 'EVIDENCE_INTEGRATION_LIMIT');
  });
  await t.test('an exhausted parent-byte budget stops all further parent-manifest reads', () => {
    const reads = [], oversized = Buffer.alloc(65 * 1024 * 1024, ' ');
    assert.equal(s.options.readCommitParents(s.integrationSha)[0], s.sourceHead);
    has(f.check({ ...s.options, readBlob: (sha, file) => {
      if (file === manifestPath) { reads.push(sha); return oversized; }
      return s.options.readBlob(sha, file);
    } }), 'EVIDENCE_INTEGRATION_LIMIT');
    assert.deepEqual(reads, [s.sourceHead]);
  });
  assert.deepEqual(f.check(s.options), []);
});

test('explicit document reconciliation verifies actual Git parents and keeps every branch record',async t=>{
  const s=realEvidenceMerge(t),{f,options,left,right,side,merged}=s;
  assert.equal(options.readCommitParents(merged.recordedAtSha).length,2);
  assert.equal(options.isAncestor(left.recordedAtSha,right.recordedAtSha),false);
  assert.deepEqual(f.check(options),[]);
  const valid=structuredClone(f.manifest);
  const cases=[
    ['unclosed branch',m=>m.evidence=m.evidence.filter(e=>e.id!==merged.id),'EVIDENCE_REVISION'],
    ['missing branch edge',m=>m.evidence.find(e=>e.id===merged.id).mergeOf=[left.id],'EVIDENCE_REVISION'],
    ['duplicate branch edge',m=>m.evidence.find(e=>e.id===merged.id).mergeOf=[left.id,left.id],'EVIDENCE_REVISION'],
    ['both revision forms',m=>m.evidence.find(e=>e.id===merged.id).supersedes=left.id,'EVIDENCE_REVISION'],
    ['cross-path predecessor',m=>m.evidence.find(e=>e.id===merged.id).mergeOf=[left.id,side.id],'EVIDENCE_REVISION'],
    ['cross-kind merge',m=>m.evidence.find(e=>e.id===merged.id).kind='screenshot','EVIDENCE_REVISION'],
    ['cycle',m=>m.evidence.find(e=>e.id===left.id).supersedes=merged.id,'EVIDENCE_REVISION_ANCHOR'],
    ['deleted side-branch evidence',m=>m.evidence=m.evidence.filter(e=>e.id!==side.id),'EVIDENCE_MERGE_HISTORY_CHANGED'],
    ['altered side-branch evidence',m=>m.evidence.find(e=>e.id===side.id).changeReason='changed after branch freeze','EVIDENCE_MERGE_HISTORY_CHANGED'],
    ['self edge',m=>m.evidence.find(e=>e.id===merged.id).mergeOf=[left.id,merged.id],'EVIDENCE_REVISION'],
  ];
  for(const [name,mutate,code] of cases)await t.test(name,()=>{Object.assign(f.manifest,structuredClone(valid));mutate(f.manifest);has(f.check(options),code);});
  Object.assign(f.manifest,structuredClone(valid));
  await t.test('an unmerged checked head cannot borrow the sibling history',()=>has(f.check({...options,checkedHead:s.leftHead}),'EVIDENCE_REVISION_ANCESTRY'));
  await t.test('missing intermediate bytes still block a closed merge',()=>has(f.check({...options,readBlob:(sha,file)=>sha===left.recordedAtSha&&file===left.path?null:options.readBlob(sha,file)}),'EVIDENCE_BLOB'));
  await t.test('parent manifest evidence is required',()=>has(f.check({...options,readBlob:(sha,file)=>sha===s.rightHead&&file===manifestPath?null:options.readBlob(sha,file)}),'EVIDENCE_MERGE_HISTORY'));
  await t.test('all actual parent branches must contribute',()=>has(f.check({...options,readCommitParents:()=>[s.leftHead,s.base]}),'EVIDENCE_MERGE_COMMIT'));
  await t.test('evidence and merge-edge ordering do not select a winning branch',()=>{f.manifest.evidence.reverse();f.manifest.evidence.find(e=>e.id===merged.id).mergeOf.reverse();assert.deepEqual(f.check(options),[]);Object.assign(f.manifest,structuredClone(valid));});
  await t.test('a frozen merge edge cannot be rewritten in the next PR',()=>{const previousManifest=structuredClone(valid);f.manifest.evidence.find(e=>e.id===merged.id).mergeOf.reverse();has(f.check({...options,previousManifest}),'EVIDENCE_HISTORY_CHANGED');Object.assign(f.manifest,structuredClone(valid));});
  await t.test('ordinary commits cannot masquerade as merges; later linear revisions remain valid',()=>{
    const body=Buffer.from('# Explicit follow-up after the verified merge\n');f.write(merged.path,body);
    const nextSha=s.commit('follow-up document',[merged.path]);
    const fake=f.manifest.evidence.find(e=>e.id===merged.id);fake.recordedAtSha=nextSha;fake.sha256=hash(body);
    has(f.check({...options,checkedHead:nextSha}),'EVIDENCE_MERGE_COMMIT');
    Object.assign(f.manifest,structuredClone(valid));f.manifest.evidence.push({id:'real-follow-up',kind:'document',path:merged.path,recordedAtSha:nextSha,sha256:hash(body),supersedes:merged.id,changeReason:'Normal forward update after convergence'});
    assert.deepEqual(f.check({...options,checkedHead:nextSha}),[]);
  });
});
