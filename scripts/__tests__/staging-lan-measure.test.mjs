import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { summarize, measure } from '../../ops/staging-lan/measure.mjs';

test('measurement summaries preserve failures and distinguish nearest-rank P95 from median', () => {
  const samples = [1, 2, 3, 100].map(n => ({ ok: true, connections: 1, dns_ms: n, tcp_ms: n, tls_ms: n, ttfb_ms: n, total_ms: n }));
  samples.push({ ok: false });
  const summary = summarize(samples);
  assert.deepEqual(summary.metrics.ttfb_ms, { median: 2.5, p95: 100 });
  assert.equal(summary.failed, 1);
  assert.equal(summarize([{ ok: false }]).metrics.total_ms.median, null);
});

test('measurement rejects credential/query URLs and invalid sample budgets before network activity', () => {
  for (const url of ['https://user:secret@example.com/', 'https://example.com/?token=secret', 'http://example.com/']) {
    assert.throws(() => measure({ url }));
  }
  assert.throws(() => measure({ url: 'https://example.com/', count: 0 }));
  assert.throws(() => measure({ url: 'https://example.com/', mode: 'unknown' }));
});

test('real curl keeps cold/reused connections distinct and never follows redirects or records cookies', async () => {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    res.writeHead(req.url === '/redirect' ? 307 : 200, { 'Content-Type': 'text/plain', 'Content-Length': '2', 'Set-Cookie': 'private_test_cookie=must_not_be_recorded', Location: '/secret-target' });
    res.end('ok');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const run = async (mode, path = '/ok') => {
    try {
      return JSON.parse((await promisify(execFile)(process.execPath, ['ops/staging-lan/measure.mjs', '--url', `${url}${path}`, '--mode', mode, '--count', '3'], { windowsHide: true })).stdout);
    } catch (error) {
      if (error.stdout) return JSON.parse(error.stdout);
      throw error;
    }
  };
  try {
    const cold = await run('cold');
    assert.equal(cold.summary.succeeded, 3);
    assert.deepEqual(cold.samples.map(s => s.connections), [1, 1, 1]);
    const warm = await run('reuse');
    assert.equal(warm.summary.reused, 2);
    assert.deepEqual(warm.samples.map(s => s.response_bytes), [2, 2, 2]);
    const redirect = await run('cold', '/redirect');
    assert.equal(redirect.summary.failed, 3);
    assert.equal(requests.includes('/secret-target'), false);
    assert.equal(JSON.stringify([cold, warm, redirect]).includes('private_test_cookie'), false);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
