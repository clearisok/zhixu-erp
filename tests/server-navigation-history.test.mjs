import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { serverNavigationHistoryScript, workspaceHistoryKey } from '../components/foundation/server-navigation-history.ts';

function browser() {
  const location = { href: 'https://example.test/quote-center' }, listeners = new Map();
  const entries = [{ state: { framework: { retained: true } }, href: location.href }]; let index = 0;
  const destination = value => { const url = new URL(value ?? location.href, location.href); if (url.origin !== 'https://example.test') throw Error('SecurityError'); return url.href; };
  const history = {
    get state() { return entries[index].state; },
    pushState(state, _title, href) { const next = destination(href); entries.splice(index + 1); entries.push({ state: structuredClone(state), href: next }); index++; location.href = next; },
    replaceState(state, _title, href) { const next = destination(href); entries[index] = { state: structuredClone(state), href: next }; location.href = next; },
  };
  const window = { history, addEventListener(type, run) { const list = listeners.get(type) ?? []; list.push(run); listeners.set(type, list); } };
  const context = vm.createContext({ window, location, Date, Math, URL });
  const install = () => vm.runInContext(serverNavigationHistoryScript, context);
  const emit = (type, event = {}) => { for (const run of listeners.get(type) ?? []) { run(event); if (event.cancelBubble) break; } };
  return { window, history, location, entries, emit, install, get index() { return index; }, traverse(next) { index = next; location.href = entries[index].href; emit('popstate', { state: entries[index].state }); } };
}

test('early installation preserves the supplied framework state and is idempotent', () => {
  const b = browser(); b.install(); const tracker = b.window.__zhixuWorkspaceHistory, push = b.history.pushState;
  assert.deepEqual(b.history.state.framework, { retained: true }); assert.equal(b.history.state[workspaceHistoryKey].index, 0);
  b.install(); assert.equal(b.window.__zhixuWorkspaceHistory, tracker); assert.equal(b.history.pushState, push);
});

test('methods captured by the framework after installation retain indexes across real push/replace semantics', () => {
  const b = browser(); b.install(); const push = b.history.pushState.bind(b.history), replace = b.history.replaceState.bind(b.history);
  push({ framework: { route: 'orders' }, scroll: 42 }, '', '/order-center');
  assert.equal(b.history.state[workspaceHistoryKey].index, 1); assert.equal(b.window.__zhixuWorkspaceHistory.index, 1);
  replace({ explicit: 'replacement' }, '', '/system-settings/roles');
  assert.equal(b.history.state[workspaceHistoryKey].index, 1); assert.equal(b.history.state.framework, undefined); assert.equal(b.history.state.scroll, undefined);
  assert.equal(b.history.state.explicit, 'replacement'); assert.equal(b.entries.length, 2);
  replace(null, '', '/quote-center#top'); assert.deepEqual(Object.keys(b.history.state), [workspaceHistoryKey]);
});

test('recovery URL writes explicitly retain the current framework state', () => {
  const b = browser(); b.install(); b.history.pushState({ framework: { route: 'quotes' }, scroll: 12 }, '', '/quote-center');
  b.history.replaceState(b.history.state, '', '/quote-center/new?creationRequestId=synthetic');
  assert.deepEqual(b.history.state.framework, { route: 'quotes' }); assert.equal(b.history.state.scroll, 12); assert.equal(b.history.state[workspaceHistoryKey].index, 1);
});

test('failed History calls do not advance the tracker', () => {
  const b = browser(); b.install(); const before = { ...b.window.__zhixuWorkspaceHistory };
  assert.throws(() => b.history.pushState({}, '', 'https://different.test/'), /SecurityError/);
  assert.deepEqual({ ...b.window.__zhixuWorkspaceHistory }, before); assert.equal(b.entries.length, 1);
});

test('Back/Forward bookkeeping reuses known entries without changing their data', () => {
  const b = browser(); b.install(); b.history.pushState({ business: 'first' }, '', '/order-center'); b.history.pushState({ business: 'second' }, '', '/system-settings/roles');
  const snapshot = structuredClone(b.entries); b.traverse(0); assert.equal(b.window.__zhixuWorkspaceHistory.index, 0);
  b.traverse(2); assert.equal(b.window.__zhixuWorkspaceHistory.index, 2); assert.deepEqual(b.entries, snapshot);
});

test('non-object foreign state is preserved and never presented as a known index', () => {
  const b = browser(); b.install(); b.history.pushState('foreign', '', '/order-center');
  assert.equal(b.history.state, 'foreign'); assert.equal(b.history.state[workspaceHistoryKey], undefined);
});

test('the early pop dispatcher consults protection before updating indexes or running framework listeners', () => {
  const b = browser(); b.install(); b.history.pushState({}, '', '/order-center'); const tracker = b.window.__zhixuWorkspaceHistory;
  let frameworkCalls = 0;
  b.window.addEventListener('popstate', () => frameworkCalls++);
  tracker.onPop = event => { assert.equal(tracker.index, 1); event.cancelBubble = true; };
  b.traverse(0); assert.equal(tracker.index, 1); assert.equal(frameworkCalls, 0);
  tracker.onPop = undefined; b.traverse(1); assert.equal(frameworkCalls, 1);
});
