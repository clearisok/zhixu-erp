// Anonymous GET measurements only. Does not change DNS, proxies, trust or application data.
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function summarize(samples) {
  const good = samples.filter(s => s.ok);
  const quantile = (values, p) => {
    const sorted = [...values].sort((a, b) => a - b);
    if (!sorted.length) return null;
    if (p === 0.5) {
      const i = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
    }
    return sorted[Math.ceil(p * sorted.length) - 1];
  };
  return {
    attempted: samples.length, succeeded: good.length, failed: samples.length - good.length,
    reused: good.filter(s => s.connections === 0).length,
    metrics: Object.fromEntries(['dns_ms', 'tcp_ms', 'tls_ms', 'ttfb_ms', 'total_ms'].map(key => [key, {
      median: quantile(good.map(s => s[key]), 0.5), p95: quantile(good.map(s => s[key]), 0.95),
    }])),
  };
}

export function measure(options) {
  const url = new URL(options.url);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw Error('https_required');
  if (url.username || url.password || url.search || url.hash) throw Error('credential_or_query_url_rejected');
  const count = Number(options.count ?? 10);
  if (!Number.isInteger(count) || count < 1 || count > 100) throw Error('invalid_count');
  const mode = options.mode ?? 'cold';
  if (!['cold', 'reuse'].includes(mode)) throw Error('invalid_mode');
  const args = ['--silent', '--noproxy', '*', '--http1.1', '--connect-timeout', '5', '--max-time', '15', '--max-redirs', '0', '--write-out', '%{json}\n'];
  if (options.resolve) args.push('--resolve', options.resolve);
  if (options.ca) args.push('--cacert', options.ca);
  if (options.host) args.push('--header', `Host: ${options.host}`);
  if (options.interface) args.push('--interface', options.interface);
  const sink = process.platform === 'win32' ? 'NUL' : '/dev/null';
  const transfer = ['--output', sink, '--url', url.href];
  const expected = Number(options.expect ?? 200);
  const rows = [];
  const runs = mode === 'cold' ? count : 1;
  for (let run = 0; run < runs; run++) {
    const requestArgs = mode === 'cold'
      ? [...args, '--no-sessionid', ...transfer]
      : [...args, ...Array.from({ length: count }, () => transfer).flat()];
    const result = spawnSync(process.platform === 'win32' ? 'curl.exe' : 'curl', requestArgs, { encoding: 'utf8', timeout: 16000 * count, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
    const lines = (result.stdout ?? '').trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const m = JSON.parse(line);
      // Never persist arbitrary curl fields, response headers, bodies, or error messages.
      const number = k => Number(m[k] ?? 0);
      rows.push({
        sample: rows.length + 1, ok: number('exitcode') === 0 && number('http_code') === expected,
        exit_code: number('exitcode'), http_status: number('http_code'),
        remote_ip: m.remote_ip, local_ip: m.local_ip, connections: number('num_connects'),
        redirects: number('num_redirects'), response_bytes: number('size_download'),
        dns_ms: number('time_namelookup') * 1000,
        tcp_ms: Math.max(0, number('time_connect') - number('time_namelookup')) * 1000,
        tls_ms: Math.max(0, number('time_appconnect') - number('time_connect')) * 1000,
        connect_cumulative_ms: number('time_connect') * 1000,
        tls_cumulative_ms: number('time_appconnect') * 1000,
        ttfb_ms: number('time_starttransfer') * 1000, total_ms: number('time_total') * 1000,
      });
    }
    const missing = (mode === 'cold' ? 1 : count) - lines.length;
    for (let i = 0; i < missing; i++) rows.push({ sample: rows.length + 1, ok: false, exit_code: result.status ?? -1, transport_output_missing: true });
  }
  return {
    recorded_at: new Date().toISOString(), label: options.label ?? 'unspecified-path', url: url.href,
    mode, expected_status: expected, curl_proxy_disabled: true,
    path_options: { resolve: options.resolve ?? null, interface: options.interface ?? null, custom_ca: Boolean(options.ca), host: options.host ?? null },
    note: 'curl --noproxy does not bypass TUN. Cold=new process/connection/TLS, OS DNS cache may remain; reuse includes first connection. P95=nearest rank. No redirects followed. Compare identical build/path/client and successful response size/status.',
    samples: rows, summary: summarize(rows),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = {};
  const allowed = new Set(['url', 'label', 'count', 'mode', 'resolve', 'ca', 'host', 'interface', 'expect', 'output']);
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i].slice(2), value = process.argv[i + 1];
    if (!process.argv[i].startsWith('--') || !allowed.has(key) || !value) throw Error('invalid_arguments');
    options[key] = value;
  }
  const report = measure(options);
  if (options.output) {
    mkdirSync(dirname(resolve(options.output)), { recursive: true });
    writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    console.log(JSON.stringify(report.summary));
  } else console.log(JSON.stringify(report, null, 2));
  if (report.summary.failed) process.exitCode = 1;
}
