import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep } from 'node:path';

const pwsh = 'C:/Program Files/PowerShell/7/pwsh.exe';
const source = readFileSync(resolve('ops/quote-trial/windows-control.ps1'), 'utf8');
const project = 'zhixu-quote-trial-win01';
const stages = ['target', 'check', 'maintenance', 'dump', 'objects-export', 'start'];

function fixture(failAt, fn) {
  const parent = mkdtempSync(join(tmpdir(), 'zhixu-control-failure-'));
  const root = join(parent, 'synthetic-target');
  const bin = join(parent, 'fake-bin');
  const calls = join(parent, 'calls.txt');
  mkdirSync(root); mkdirSync(bin); mkdirSync(join(root, 'tools'));
  try {
    // Change only the fixed root in a temporary copy. All invoked native commands
    // are .cmd stubs, not PowerShell functions: native exit semantics are real.
    const binding = "$root='D:\\zhixu-local-trial\\win01'";
    assert.equal(source.split(binding).length, 2);
    const script = join(parent, 'control.ps1');
    writeFileSync(script, source.replace(binding, `$root='${root.replaceAll("'", "''")}'`));
    writeFileSync(join(root, 'target.json'), JSON.stringify({ root, project, files: {} }));
    writeFileSync(join(root, 'trial.conf'), 'TRIAL_OBJECT_BUNDLE_DIR=synthetic\n');
    const target = JSON.stringify({ project, container: `${project}-database-1`, volume: `${project}_data`, database: 'quote_trial', fingerprint: 'synthetic-only' });
    writeFileSync(join(bin, 'node.cmd'), `@echo off\r\necho %~2>>"%FAKE_CALLS%"\r\nif "%~2"=="%FAIL_AT%" exit /b 37\r\nif "%~2"=="target" echo ${target}\r\nexit /b 0\r\n`);
    writeFileSync(join(bin, 'docker.cmd'), '@echo off\r\nif "%~2"=="show" echo desktop-linux\r\nif "%~2"=="inspect" echo npipe:////./pipe/dockerDesktopLinuxEngine\r\nexit /b 0\r\n');
    writeFileSync(join(root, 'tools', 'Backup-Zhixu.ps1'), "Add-Content -LiteralPath $env:FAKE_CALLS -Value 'dump'\n");
    const result = spawnSync(pwsh, ['-NoProfile', '-NonInteractive', '-File', script, '-Action', 'Backup'], {
      encoding: 'utf8', timeout: 20000,
      env: { ...process.env, PATH: bin + ';' + process.env.PATH, FAKE_CALLS: calls, FAIL_AT: failAt },
    });
    assert.equal(result.error, undefined);
    const observed = readFileSync(calls, 'utf8').trim().split(/\r?\n/);
    fn(result, observed);
  } finally {
    assert.ok(resolve(parent).startsWith(resolve(tmpdir()) + sep));
    rmSync(parent, { recursive: true, force: true });
  }
}

for (const stage of ['check', 'maintenance', 'objects-export', 'start']) {
  test(`PowerShell native ${stage} failure stops Backup without false PASS or subsequent steps`, { skip: process.platform !== 'win32' }, () => {
    fixture(stage, (result, observed) => {
      assert.equal(result.status, 1);
      assert.deepEqual(observed, stages.slice(0, stages.indexOf(stage) + 1));
      assert.doesNotMatch(result.stdout + result.stderr, /BACKUP_AND_RESUME_PASS|synthetic-only/);
      const safe = JSON.parse(result.stdout.trim());
      assert.equal(safe.result, 'FAIL');
      assert.equal(safe.maintenance, true);
    });
  });
}
test('all synthetic native steps succeed before Backup reports PASS', { skip: process.platform !== 'win32' }, () => {
  fixture('none', (result, observed) => {
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(observed, stages);
    assert.equal(JSON.parse(result.stdout.trim()).result, 'BACKUP_AND_RESUME_PASS');
  });
});
