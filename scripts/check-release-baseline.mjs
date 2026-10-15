import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export const manifestPath = 'docs/release/baseline.json';
// Bootstrap only while PR95's base has no manifest; this reviewed commit is in its ancestry.
export const initialReviewSha = 'b5411b68618e663d97ca50ac5bb9f49bc688193e';
const fullSha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const requiredPages = ['quote-list', 'quote-new', 'quote-detail', 'quote-settings', 'order-list', 'order-detail', 'material', 'login', 'navigation'];
const requiredCapabilities = ['quote', 'commercial-security', 'order', 'material', 'delivery-plan', 'intake', 'production', 'closing'];
const statusDimensions = ['implemented', 'merged', 'isolatedTest', 'humanAcceptance', 'sourceActivation', 'trial18443', 'preview18444'];
const statusValue = (capability, dimension) => dimension.endsWith('18443') || dimension.endsWith('18444') ? capability.environments?.[dimension] : capability[dimension];
const digest = (bytes, kind) => createHash('sha256').update(kind === 'document' ? bytes.toString('utf8').replaceAll('\r\n', '\n') : bytes).digest('hex');
const safePath = relative => nonempty(relative) && !relative.includes('\\') && !path.posix.isAbsolute(relative)
  && !relative.split('/').some(part => part === '..' || part === '' || part === '.') && !/^[A-Za-z]:/.test(relative);

function repositoryReader(root) {
  const canonicalRoot = realpathSync(root);
  return relative => {
    if (!safePath(relative)) {
      throw new Error('unsafe_repository_path');
    }
    const target = realpathSync(path.resolve(canonicalRoot, relative));
    const distance = path.relative(canonicalRoot, target);
    if (distance.startsWith(`..${path.sep}`) || distance === '..' || path.isAbsolute(distance)) throw new Error('path_escapes_repository');
    return readFileSync(target);
  };
}

export function cssImports(source, entry) {
  const parsed = ts.createSourceFile(entry, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (parsed.parseDiagnostics.length) throw new Error('invalid_css_entry_syntax');
  return parsed.statements.filter(node => ts.isImportDeclaration(node) && !node.importClause
    && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.endsWith('.css')).map(node => node.moduleSpecifier.text).map(specifier =>
    specifier.startsWith('@/') ? specifier.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(entry), specifier)));
}

export function isUiPath(file) {
  // Conservative review inputs, including helpers extracted from TSX. Domain-only
  // changes can declare V0; a filename extension must not silently exempt a layout.
  const testOnly = /(^|\/)(__tests__|__fixtures__)\//.test(file) || /\.(test|spec|d)\.[cm]?[jt]sx?$/.test(file);
  return !testOnly && /\.(?:[cm]?[jt]sx?|html?|mdx|css|scss|sass|less|svg|png|jpe?g|gif|avif|webp|woff2?|json)$/.test(file) && /^(app|components|features)\//.test(file)
    || /^public\//.test(file)
    || /^(vite|next|postcss|tailwind)\.config\.[cm]?[jt]s$/.test(file);
}

function serverRouteLiterals(source) {
  const parsed = ts.createSourceFile('quote-authority.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (parsed.parseDiagnostics.length) return null;
  const declarations = parsed.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'isServerQuoteRoute');
  if (declarations.length !== 1) return null;
  const body = declarations[0].body;
  if (!body || body.statements.length !== 1 || !ts.isReturnStatement(body.statements[0])) return null;
  const call = body.statements[0].expression;
  if (!call || !ts.isCallExpression(call) || call.arguments.length !== 1 || !ts.isIdentifier(call.arguments[0])
    || call.arguments[0].text !== 'path' || !ts.isPropertyAccessExpression(call.expression)
    || call.expression.name.text !== 'includes' || !ts.isArrayLiteralExpression(call.expression.expression)) return null;
  const elements = call.expression.expression.elements;
  return elements.every(ts.isStringLiteral) ? elements.map(node => node.text) : null;
}

/** Read-only source/evidence contract. This is not a browser pixel or deployment test. */
export function validateBaseline({ root, manifest, expectedBaseSha, changedPaths = [], hasCommit = () => false,
  readBlob = () => null, isAncestor = () => false, checkedHead, previousManifest }) {
  const errors = [];
  const fail = (code, detail) => errors.push({ code, detail });
  const read = repositoryReader(root);
  const checkPath = relative => {
    try { return read(relative); } catch { fail('EVIDENCE_PATH', String(relative)); return null; }
  };
  const checkSha = (value, label) => {
    if (!fullSha(value) || !hasCommit(value)) fail('SOURCE_SHA', label);
  };
  if (!manifest || manifest.schemaVersion !== 2 || manifest.repository !== 'clearisok/zhixu-erp') {
    return [{ code: 'MANIFEST_SCHEMA', detail: 'Expected release baseline v2 for clearisok/zhixu-erp' }];
  }
  checkSha(manifest.baselineSha, 'baselineSha');
  if (expectedBaseSha !== undefined && (!fullSha(expectedBaseSha) || manifest.baselineSha !== expectedBaseSha)) fail('BASE_SHA_MISMATCH', 'Reconcile the snapshot against the actual PR base; do not copy an old baseline.');
  if (!nonempty(manifest.verifiedAt) || Number.isNaN(Date.parse(manifest.verifiedAt)) || !nonempty(manifest.owner)) fail('MANIFEST_METADATA', 'verifiedAt and owner required');

  const evidence = new Map();
  const historicalHashes = new Map();
  const priorEvidence = new Map((previousManifest?.evidence ?? []).map(item => [item.id, item]));
  if (!previousManifest || ![1, 2].includes(previousManifest.schemaVersion)) fail('HISTORY_REQUIRED', 'A Git-loaded prior manifest is required.');
  const proposedEvidence = new Map((manifest.evidence ?? []).map(item => [item.id, item]));
  // Multiple checkpoint revisions in one PR must still terminate at an immutable base record.
  const anchoredRevision = item => {
    const visited = new Set([item.id]);
    let parent = item.supersedes;
    while (!priorEvidence.has(parent)) {
      if (!parent || visited.has(parent)) return false;
      visited.add(parent);
      const previous = proposedEvidence.get(parent);
      if (!previous || previous.kind !== item.kind || previous.path !== item.path) return false;
      parent = previous.supersedes;
    }
    return true;
  };
  const superseded = new Set();
  const revisions = new Map((manifest.evidence ?? []).map(item => [item.id, item]));
  const successor = new Map();
  const candidates = new Map();
  for (const item of manifest.evidence ?? []) {
    if (!nonempty(item.id) || candidates.has(item.id)) fail('EVIDENCE_ID', String(item.id));
    candidates.set(item.id, item);
  }
  for (const item of candidates.values()) {
    if (!item.supersedes) continue;
    const old = revisions.get(item.supersedes);
    if (!old || old.kind !== item.kind || (item.kind === 'document' ? old.path !== item.path || old.recordedAtSha === item.recordedAtSha : old.path === item.path)
      || !nonempty(item.changeReason) || successor.has(item.supersedes)) {
      fail('EVIDENCE_REVISION', String(item.id)); continue;
    }
    successor.set(item.supersedes, item.id);
    // A stacked revision must trace back to evidence frozen in the actual PR base.
    // No synthetic root, dangling link, fork or cycle may hide worktree drift.
    let cursor = item;
    const visited = new Set();
    let anchored = false;
    while (cursor) {
      if (visited.has(cursor.id)) break;
      visited.add(cursor.id);
      if (priorEvidence.has(cursor.id)) { anchored = true; break; }
      cursor = cursor.supersedes ? revisions.get(cursor.supersedes) : null;
    }
    if (!anchored) { fail('EVIDENCE_REVISION', String(item.id)); if (item.kind === 'document') fail('EVIDENCE_REVISION_ANCHOR', item.id); continue; }
    if (item.kind === 'document') {
      if (!priorEvidence.has(item.id)) {
        if (!isAncestor(manifest.baselineSha, item.recordedAtSha) || !isAncestor(item.recordedAtSha, checkedHead)
          || !priorEvidence.has(old.id) && !isAncestor(old.recordedAtSha, item.recordedAtSha)) fail('EVIDENCE_REVISION_ANCESTRY', item.id);
        if (!anchoredRevision(item)) { fail('EVIDENCE_REVISION_ANCHOR', item.id); fail('EVIDENCE_REVISION', item.id); }
      }
      superseded.add(item.supersedes);
    }
  }
  const leaves = new Map();
  for (const item of candidates.values()) if (item.kind === 'document' && !superseded.has(item.id)) {
    if (leaves.has(item.path)) fail('EVIDENCE_REVISION_LEAF', item.path);
    leaves.set(item.path, item.id);
  }
  for (const item of manifest.evidence ?? []) {
    if (!nonempty(item.id) || evidence.has(item.id)) fail('EVIDENCE_ID', String(item.id));
    evidence.set(item.id, item);
    const bytes = checkPath(item.path);
    checkSha(item.recordedAtSha, `evidence:${item.id}`);
    let historical;
    try { historical = fullSha(item.recordedAtSha) && safePath(item.path) ? readBlob(item.recordedAtSha, item.path) : null; } catch { /* Fail closed. */ }
    if (!Buffer.isBuffer(historical)) fail('EVIDENCE_BLOB', String(item.id));
    else {
      const hash = digest(historical, item.kind);
      historicalHashes.set(item.id, hash);
      if (hash !== item.sha256) fail('EVIDENCE_BLOB_HASH', String(item.id));
      if (bytes && !superseded.has(item.id) && digest(bytes, item.kind) !== hash) fail('EVIDENCE_WORKTREE_DRIFT', String(item.id));
    }
    if (!/^[0-9a-f]{64}$/.test(item.sha256 ?? '')) fail('EVIDENCE_HASH', String(item.id));
    if (item.kind === 'screenshot') {
      checkSha(item.renderedSourceSha, `rendered:${item.id}`);
      if (!/^[0-9a-f]{64}$/.test(item.sha256 ?? '') || bytes && createHash('sha256').update(bytes).digest('hex') !== item.sha256) fail('SCREENSHOT_HASH', String(item.id));
      if (bytes && !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) fail('SCREENSHOT_FORMAT', String(item.id));
    } else if (item.kind !== 'document') fail('EVIDENCE_KIND', String(item.id));
  }
  for (const [id, prior] of priorEvidence) {
    const current = evidence.get(id);
    if (!current || ['kind', 'path', 'recordedAtSha', 'renderedSourceSha', 'supersedes', 'changeReason', 'approvalEvidence', ...(prior.sha256 ? ['sha256'] : [])]
      .some(key => !same(current[key], prior[key]))) fail('EVIDENCE_HISTORY_CHANGED', id);
  }
  for (const item of evidence.values()) {
    if (item.kind === 'screenshot' && !priorEvidence.has(item.id)
      && (!nonempty(item.changeReason) || evidence.get(item.approvalEvidence)?.kind !== 'document')) fail('SCREENSHOT_APPROVAL', item.id);
  }
  const refs = (items, label) => {
    if (!Array.isArray(items) || items.length === 0) { fail('EVIDENCE_REQUIRED', label); return; }
    for (const id of items) if (!evidence.has(id)) fail('EVIDENCE_REFERENCE', `${label}:${id}`);
  };

  const pages = new Map();
  for (const page of manifest.pages ?? []) {
    if (!nonempty(page.id) || pages.has(page.id)) fail('PAGE_ID', String(page.id));
    pages.set(page.id, page);
    if (!nonempty(page.route) || !page.route.startsWith('/') || !nonempty(page.acceptanceScope)
      || !['approved-history', 'implementation-only'].includes(page.acceptance)) fail('PAGE_CONTRACT', String(page.id));
    checkPath(page.routeFile);
    if (!Array.isArray(page.components) || page.components.length === 0) fail('PAGE_COMPONENT', String(page.id));
    for (const component of page.components ?? []) checkPath(component);
    refs(page.evidence, page.id);
    if (page.acceptance === 'approved-history' && !page.evidence?.some(id => evidence.get(id)?.kind === 'document')) fail('ACCEPTANCE_EVIDENCE', page.id);
  }
  for (const id of requiredPages) if (!pages.has(id)) fail('PAGE_REQUIRED', id);

  const production = manifest.css?.production;
  const entries = [production, ...(manifest.css?.previews ?? [])];
  if (!production || entries.length < 2) fail('CSS_CONTRACT', 'production and preview entries required');
  for (const entry of entries) {
    if (!entry || !Array.isArray(entry.styles)) { fail('CSS_CONTRACT', 'missing entry/styles'); continue; }
    const bytes = checkPath(entry.entry);
    const styles = entry.styles;
    if (styles[0] !== 'app/globals.css' || !styles.includes('app/foundation.css') || new Set(styles).size !== styles.length) fail('FOUNDATION_REQUIRED', String(entry.entry));
    for (const file of styles) checkPath(file);
    if (bytes) {
      try { if (!same(cssImports(bytes.toString('utf8'), entry.entry), styles)) fail('CSS_ENTRY_ORDER', String(entry.entry)); }
      catch { fail('CSS_ENTRY_SYNTAX', String(entry.entry)); }
    }
    if (production?.styles) {
      const shared = styles.filter(file => production.styles.includes(file));
      if (shared.at(-1) !== 'app/foundation.css' || !same(shared, production.styles.filter(file => shared.includes(file)))) fail('CSS_SHARED_ORDER', String(entry.entry));
    }
  }

  const responsive = manifest.responsive;
  if (!responsive || !same(responsive.observedBreakpoints, [600, 1100, 1440]) || responsive.decisionReconciliation !== 'pending-no-behavior-change') fail('RESPONSIVE_CONTRACT', 'Record the existing behavior and unresolved D-023 conflict separately.');
  const responsiveBytes = checkPath('components/foundation/responsive.ts');
  if (responsiveBytes) {
    const source = responsiveBytes.toString('utf8');
    for (const [name, value] of [['MOBILE_WIDTH', 600], ['PRIMARY_WIDTH', 1100], ['WIDE_WIDTH', 1440]]) {
      if (!new RegExp(`export const ${name} = ${value};`).test(source)) fail('RESPONSIVE_DRIFT', name);
    }
  }
  refs(responsive?.evidence, 'responsive');

  const routeSource = checkPath('features/quote-center/authority/quote-authority.ts')?.toString('utf8');
  const actualRoutes = routeSource ? serverRouteLiterals(routeSource) : null;
  if (!actualRoutes || !same(actualRoutes, manifest.serverRoutes)) fail('ROUTE_CAPABILITY_DRIFT', 'Reconcile actual Server allowlist; this check never activates a route.');

  const capabilities = new Map();
  const priorCapabilities = new Map((previousManifest?.capabilities ?? []).map(capability => [capability.id, capability]));
  const priorHashes = new Set();
  for (const item of priorEvidence.values()) {
    try { const blob = readBlob(item.recordedAtSha, item.path); if (Buffer.isBuffer(blob)) priorHashes.add(digest(blob, item.kind)); }
    catch { fail('HISTORY_BLOB', item.id); }
  }
  const novelEvidence = ids => Array.isArray(ids) && ids.some(id => !priorEvidence.has(id)
    && evidence.get(id)?.kind === 'document' && historicalHashes.has(id) && !priorHashes.has(historicalHashes.get(id)));
  for (const capability of manifest.capabilities ?? []) {
    if (!nonempty(capability.id) || capabilities.has(capability.id)) fail('CAPABILITY_ID', String(capability.id));
    capabilities.set(capability.id, capability);
    if (!['yes', 'partial', 'no'].includes(capability.implemented) || typeof capability.merged !== 'boolean'
      || !['passed-historical', 'not-run'].includes(capability.isolatedTest)
      || !['accepted-historical', 'partial', 'not-run', 'unknown'].includes(capability.humanAcceptance)
      || !['active-historical', 'not-connected', 'not-applicable', 'unknown'].includes(capability.sourceActivation)
      || !nonempty(capability.scope)) fail('CAPABILITY_STATUS', String(capability.id));
    for (const environment of ['trial18443', 'preview18444']) {
      if (!['deployed-historical', 'not-deployed', 'not-open', 'unknown'].includes(capability.environments?.[environment])) fail('DEPLOYMENT_STATUS', `${capability.id}:${environment}`);
    }
    refs(capability.evidence, capability.id);
    if (capability.implemented === 'no' && (capability.merged || capability.isolatedTest !== 'not-run'
      || ['accepted-historical', 'partial'].includes(capability.humanAcceptance) || capability.sourceActivation === 'active-historical'
      || Object.values(capability.environments ?? {}).includes('deployed-historical'))) fail('CAPABILITY_OVERCLAIM', capability.id);
    const prior = priorCapabilities.get(capability.id);
    for (const dimension of statusDimensions) {
      const value = statusValue(capability, dimension), claim = capability.statusEvidence?.[dimension];
      if (!claim || claim.value !== value || !nonempty(claim.scope) || !nonempty(claim.assessedAt)
        || Number.isNaN(Date.parse(claim.assessedAt))) { fail('STATUS_EVIDENCE', `${capability.id}:${dimension}`); continue; }
      refs(claim.evidence, `${capability.id}:${dimension}`);
      checkSha(claim.sourceSha, `${capability.id}:${dimension}`);
      if (!Array.isArray(claim.evidence) || !claim.evidence.every(id => evidence.get(id)?.kind === 'document')) fail('STATUS_EVIDENCE_KIND', `${capability.id}:${dimension}`);
      if (!prior || statusValue(prior, dimension) !== value) {
        if (!novelEvidence(claim.evidence)) {
          fail('STATUS_TRANSITION_EVIDENCE', `${capability.id}:${dimension}`);
        }
      }
      if (dimension === 'trial18443' || dimension === 'preview18444') {
        const runtime = manifest.runtimeSnapshots?.find(item => item.id === dimension);
        if (claim.runtimeId !== dimension || claim.sourceSha !== runtime?.sourceSha || claim.imageId !== runtime?.imageId) fail('STATUS_RUNTIME', `${capability.id}:${dimension}`);
      }
      if (dimension === 'sourceActivation' && value === 'active-historical'
        && (!Array.isArray(claim.runtimeIds) || claim.runtimeIds.length === 0
          || claim.runtimeIds.some(id => capability.environments?.[id] !== 'deployed-historical'))) fail('SOURCE_ACTIVATION_EVIDENCE', capability.id);
    }
  }
  for (const id of requiredCapabilities) if (!capabilities.has(id)) fail('CAPABILITY_REQUIRED', id);

  const runtimeIds = new Set();
  for (const runtime of manifest.runtimeSnapshots ?? []) {
    if (runtimeIds.has(runtime.id)) fail('RUNTIME_DUPLICATE', String(runtime.id));
    runtimeIds.add(runtime.id);
    checkSha(runtime.sourceSha, `runtime:${runtime.id}`);
    if (!/^sha256:[0-9a-f]{64}$/.test(runtime.imageId ?? '') || !nonempty(runtime.observedAt) || Number.isNaN(Date.parse(runtime.observedAt))
      || runtime.reverifiedByThisTask !== false || !nonempty(runtime.observationScope)) fail('RUNTIME_SNAPSHOT', String(runtime.id));
    refs(runtime.evidence, runtime.id);
    const prior = previousManifest?.runtimeSnapshots?.find(item => item.id === runtime.id);
    if ((!prior || prior.sourceSha !== runtime.sourceSha || prior.imageId !== runtime.imageId) && !novelEvidence(runtime.evidence)) fail('RUNTIME_TRANSITION_EVIDENCE', String(runtime.id));
  }
  for (const id of ['trial18443', 'preview18444']) if (!runtimeIds.has(id)) fail('RUNTIME_REQUIRED', id);
  for (const document of ['docs/CURRENT_STATE.md', 'docs/AI_HANDOFF.md', 'docs/PROJECT_INDEX.md']) {
    const body = checkPath(document)?.toString('utf8');
    if (!nonempty(body) || !body.includes(manifest.baselineSha)) fail('STATE_BASELINE_DRIFT', document);
  }

  const uiChanges = changedPaths.filter(isUiPath);
  const covered = new Set();
  const records = changedPaths.filter(file => /^docs\/release\/ui-changes\/[^/]+\.json$/.test(file));
  for (const recordPath of records) {
    let record;
    try { record = JSON.parse(read(recordPath).toString('utf8')); } catch { fail('UI_CHANGE_RECORD', recordPath); continue; }
    if (record.baselineSha !== manifest.baselineSha || !['V0', 'V1', 'V2', 'V3'].includes(record.level)
      || !nonempty(record.visibleDifference) || !Array.isArray(record.paths) || record.paths.length === 0
      || !Array.isArray(record.pages) || record.pages.length === 0) { fail('UI_CHANGE_RECORD', recordPath); continue; }
    for (const id of record.pages) if (!pages.has(id)) fail('UI_CHANGE_PAGE', `${recordPath}:${id}`);
    if (record.level === 'V0' && record.visibleDifference !== 'none') fail('UI_CHANGE_LEVEL', recordPath);
    if (!Array.isArray(record.evidence) || record.evidence.length === 0) fail('UI_CHANGE_EVIDENCE', recordPath);
    for (const file of record.evidence ?? []) checkPath(file);
    if (['V2', 'V3'].includes(record.level)) {
      if (record.approval?.status !== 'user-approved' || !nonempty(record.approval?.reference)) fail('UI_APPROVAL_REQUIRED', recordPath);
      else checkPath(record.approval.reference);
    }
    for (const file of record.paths) {
      if (!uiChanges.includes(file)) fail('UI_CHANGE_PATH', `${recordPath}:${file}`);
      covered.add(file);
    }
  }
  for (const file of uiChanges) if (!covered.has(file)) fail('UI_CHANGE_UNDECLARED', file);
  return errors;
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 15000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git_read_failed:${args[0]}`);
  return result.stdout.trim();
}

export function readEvidenceBlob(root, sha, file) {
  if (!fullSha(sha) || !safePath(file)) throw new Error('invalid_evidence_blob_identity');
  const result = spawnSync('git', ['show', `${sha}:${file}`], { cwd: root, timeout: 15000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('evidence_blob_unavailable');
  return result.stdout;
}

export function runCheck(root, expectedBaseSha) {
  const manifest = JSON.parse(repositoryReader(root)(manifestPath).toString('utf8'));
  if (!fullSha(manifest.baselineSha)) throw new Error('invalid_baseline_sha');
  // Local/default inspection compares working changes with HEAD. PR CI supplies
  // its real base explicitly, including after squash merges/deleted PR branches.
  const base = expectedBaseSha ?? git(root, ['rev-parse', 'HEAD']);
  if (!fullSha(base)) throw new Error('invalid_base_sha');
  git(root, ['merge-base', '--is-ancestor', base, 'HEAD']);
  const historySha = git(root, ['ls-tree', base, '--', manifestPath]) ? base : initialReviewSha;
  git(root, ['merge-base', '--is-ancestor', historySha, 'HEAD']);
  const previousManifest = JSON.parse(readEvidenceBlob(root, historySha, manifestPath).toString('utf8'));
  const changedPaths = [...new Set([
    ...git(root, ['diff', '--no-ext-diff', '--no-textconv', '--name-only', '--no-renames', '-z', base, '--']).split('\0'),
    ...git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
  ].filter(Boolean))];
  const commitCache = new Map();
  const blobCache = new Map();
  const ancestryCache = new Map();
  const errors = validateBaseline({ root, manifest, expectedBaseSha, changedPaths, previousManifest, checkedHead:git(root,['rev-parse','HEAD']),
    isAncestor: (ancestor, descendant) => {
      const key = `${ancestor}:${descendant}`;
      if (!ancestryCache.has(key)) {
        try { git(root, ['merge-base', '--is-ancestor', ancestor, descendant]); ancestryCache.set(key, true); }
        catch { ancestryCache.set(key, false); }
      }
      return ancestryCache.get(key);
    },
    readBlob: (sha, file) => {
      const key = `${sha}:${file}`;
      if (!blobCache.has(key)) blobCache.set(key, readEvidenceBlob(root, sha, file));
      return blobCache.get(key);
    },
    hasCommit: sha => {
      if (!commitCache.has(sha)) {
        try { git(root, ['cat-file', '-e', `${sha}^{commit}`]); commitCache.set(sha, true); }
        catch { commitCache.set(sha, false); }
      }
      return commitCache.get(sha);
    } });
  return { status: errors.length ? 'FAIL' : 'PASS', baselineSha: manifest.baselineSha, checkedHead: git(root, ['rev-parse', 'HEAD']),
    historySha, pages: manifest.pages?.length, capabilities: manifest.capabilities?.length, changedUiFiles: changedPaths.filter(isUiPath).length,
    scope: 'source/evidence guard only; no browser, runtime, database or user acceptance claim', errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 0 && !(args.length === 2 && args[0] === '--base-sha' && fullSha(args[1]))) throw new Error('usage: node scripts/check-release-baseline.mjs [--base-sha <40-character-sha>]');
    const root = process.cwd();
    if (!existsSync(path.join(root, manifestPath))) throw new Error('run_from_repository_root');
    const result = runCheck(root, args[1]);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.errors.length ? 1 : 0;
  } catch (error) {
    console.error(JSON.stringify({ status: 'FAIL', error: error.message }));
    process.exitCode = 1;
  }
}
