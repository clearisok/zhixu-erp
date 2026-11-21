// Anonymous GETs only, fixed Staging origin, no credentials or redirects.
import https from 'node:https';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { isIP } from 'node:net';

export function publicAddress(address) {
  if (!address) return false;
  const ip = address.replace(/^::ffff:/iu, '');
  if (isIP(ip) === 6) return !/^(?:::|fc|fd|fe[89ab]|ff|2001:db8:)/iu.test(ip);
  if (isIP(ip) !== 4) return false;
  const p = ip.split('.').map(Number);
  return p.length === 4 && p.every(n => Number.isInteger(n) && n >= 0 && n <= 255)
    && p[0] > 0 && p[0] < 224 && ![10, 127].includes(p[0])
    && !(p[0] === 172 && p[1] >= 16 && p[1] <= 31)
    && !(p[0] === 192 && p[1] === 168) && !(p[0] === 169 && p[1] === 254)
    && !(p[0] === 198 && [18, 19].includes(p[1]))
    && !(p[0] === 100 && p[1] >= 64 && p[1] <= 127);
}

export async function get(path) {
  if (!['/login', '/api/v1/health', '/build-info.json', '/cdn-cgi/trace'].includes(path)) throw new Error('fixed_probe_path_required');
  return new Promise((resolve, reject) => {
    const start = performance.now();
    let dns = start, connected = start, secured = start;
    const agent = new https.Agent({ keepAlive: false, maxCachedSessions: 0 });
    const req = https.get(new URL(path, 'https://staging.weaveops.top'), {
      agent, rejectUnauthorized: true, timeout: 15000,
      headers: { 'User-Agent': 'WeaveOps-Staging-Public-Smoke/163' },
    }, res => {
      const first = performance.now();
      const remoteIP = res.socket.remoteAddress;
      const trustedTls = res.socket.authorized === true;
      const parts = []; let bytes = 0;
      res.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024) req.destroy(new Error('response_budget'));
        else parts.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        const result = { path, status: res.statusCode, remoteIP,
          trustedTls, bytes, redirectsFollowed: 0,
          cloudflareColo: String(res.headers['cf-ray'] ?? '').split('-').at(-1),
          tcpMs: connected - dns, tlsMs: secured - connected,
          ttfbMs: first - start, totalMs: performance.now() - start };
        agent.destroy();
        if (result.status !== 200 || !result.trustedTls || !publicAddress(result.remoteIP)
          || !/^[A-Z]{3}$/u.test(result.cloudflareColo)) {
          reject(Object.assign(new Error('public_ingress_assertion'), { observation: result }));
        } else resolve({ result, body: Buffer.concat(parts).toString('utf8') });
      });
    });
    req.on('socket', socket => {
      socket.once('lookup', () => { dns = performance.now(); });
      socket.once('connect', () => { connected = performance.now(); });
      socket.once('secureConnect', () => { secured = performance.now(); });
    });
    req.once('timeout', () => req.destroy(new Error('request_timeout')));
    req.once('error', error => { agent.destroy(); reject(error); });
  });
}

export async function main() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') {
    throw new Error('independent_github_hosted_runner_required');
  }
  const report = { schema: 'weaveops-public-smoke.v1', at: new Date().toISOString(),
    execution: 'GitHub hosted runner; independent of office and server networks',
    source: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, samples: [] };
  try {
    for (let n = 1; n <= 10; n++) report.samples.push((await get('/login')).result);
    const health = await get('/api/v1/health');
    const h = JSON.parse(health.body);
    if (h.status !== 'ok' || h.database !== 'ready') throw new Error('health_not_ready');
    report.health = { ...health.result, database: h.database };
    const build = await get('/build-info.json');
    const b = JSON.parse(build.body);
    report.build = { ...build.result, sourceSha: b.sourceSha ?? b.commitSha ?? b.commit ?? null };
    const trace = await get('/cdn-cgi/trace');
    const values = Object.fromEntries(trace.body.split('\n').filter(x => x.includes('=')).map(x => x.split('=', 2)));
    report.trace = Object.fromEntries(['colo', 'loc', 'warp', 'http'].map(k => [k, values[k]]));
    const sorted = report.samples.map(x => x.ttfbMs).sort((a, b) => a - b);
    report.summary = { success: 10, failed: 0, medianTtfbMs: (sorted[4] + sorted[5]) / 2, p95TtfbMs: sorted[9] };
    report.state = 'PASS';
  } catch (error) {
    report.state = 'FAIL';
    report.error = error.observation ? { code: 'public_ingress_assertion', observation: error.observation }
      : { code: ['request_timeout', 'response_budget', 'health_not_ready'].includes(error.message) ? error.message : error.code ?? 'request_or_format_error' };
    process.exitCode = 1;
  }
  process.stdout.write(JSON.stringify(report) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { process.stderr.write('Independent public smoke prerequisite failed\n'); process.exitCode = 1; });
}
