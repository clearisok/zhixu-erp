import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const pwsh = 'C:/Program Files/PowerShell/7/pwsh.exe';
const script = resolve('ops/quote-trial/windows-setup.ps1');
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const windows = process.platform === 'win32';
function run(body) {
  return execFileSync(pwsh, ['-NoProfile', '-NonInteractive', '-Command', `. ${quote(script)} -LibraryOnly; ${body}`],
    { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] });
}
function fixture(fn) {
  const parent = mkdtempSync(join(tmpdir(), 'zhixu-win-setup-test-'));
  const root = join(parent, 'private');
  try { fn(root, parent); } finally {
    // Only this test's unique synthetic directory; never the actual deployment root.
    assert.ok(resolve(parent).startsWith(resolve(tmpdir()) + '\\'));
    rmSync(parent, { recursive: true, force: true });
  }
}
const template = 'TRIAL_DB_PASSWORD=@DB_PASSWORD@\nTRIAL_ADMIN_PASSWORD=@ADMIN_PASSWORD@\n';
function save(root, overrides = {}) {
  return `Save-TrialInputs ${quote(root)} ${quote(overrides.id ?? 'SYNTHETIC-ID')} ${quote(overrides.key ?? 'SYNTHETIC-KEY')} ${quote(overrides.admin ?? 'SYNTHETIC-ADMIN-123')} ${quote(overrides.viewer ?? 'SYNTHETIC-VIEWER-123')} ${quote(template)}`;
}
test('PowerShell 7 parses the Windows wrapper, hidden input is not a command argument', { skip: !windows }, () => {
  const output = run(`$tokens=$null; $errors=$null; [void][Management.Automation.Language.Parser]::ParseFile(${quote(script)},[ref]$tokens,[ref]$errors); $errors.Count`);
  assert.equal(output.trim(), '0');
  const code = readFileSync(script, 'utf8');
  assert.match(code, /Read-Host \$Prompt -AsSecureString/);
  assert.match(code, /ZeroFreeBSTR/);
  // Subsequent backups must mount their new explicit bundle, not the first fixed directory.
  assert.match(code, /`\$\{TRIAL_OBJECT_BUNDLE_DIR:\?explicit protected bundle directory required\}:\/bundle/);
  assert.doesNotMatch(code, /new\('Root', 'LocalMachine'\)|rejectUnauthorized=false|--ignore-certificate-errors/);
});
test('daily control entry parses, offers no init/restore/cleanup operation, keeps canonical target guards', { skip: !windows }, () => {
  const control = resolve('ops/quote-trial/windows-control.ps1');
  const output = run(`$tokens=$null; $errors=$null; [void][Management.Automation.Language.Parser]::ParseFile(${quote(control)},[ref]$tokens,[ref]$errors); $errors.Count`);
  assert.equal(output.trim(), '0');
  const code = readFileSync(control, 'utf8');
  assert.match(code, /ValidateSet\('Start','Status','Restart','Logs','Backup'\)/);
  assert.match(code, /ExpectedTargetFingerprint \$target.fingerprint/);
  assert.match(code, /FileMode\]::CreateNew/);
  assert.doesNotMatch(code, /db:migrate|objects-restore|Remove-Item|--volumes|Invoke-Expression/);
});
test('fake inputs publish only inside protected Windows ACL, without printing credentials/hashes', { skip: !windows }, () => fixture(root => {
  const output = run(`New-PrivateDirectory ${quote(root)}; [void][IO.Directory]::CreateDirectory(${quote(join(root, 'secrets'))}); ${save(root)}; Assert-PrivateDirectory ${quote(root)}; 'PASS'`);
  assert.equal(output.trim(), 'PASS');
  const config = readFileSync(join(root, 'trial.conf'), 'utf8');
  assert.match(config, /TRIAL_DB_PASSWORD=[a-f0-9]{64}/);
  assert.match(config, /TRIAL_ADMIN_PASSWORD=SYNTHETIC-ADMIN-123/);
  const receipt = JSON.parse(readFileSync(join(root, 'inputs-ready.json'), 'utf8'));
  assert.equal(receipt.networkContacted, false);
  assert.equal(receipt.databaseContacted, false);
  assert.equal(receipt.linuxPermissionsVerified, false);
  assert.doesNotMatch(JSON.stringify(receipt), /SYNTHETIC|password|hash|key/i);
}));
test('invalid fake input rejects before any credential/config publication', { skip: !windows }, () => fixture(root => {
  const output = run(`New-PrivateDirectory ${quote(root)}; [void][IO.Directory]::CreateDirectory(${quote(join(root, 'secrets'))}); try { ${save(root, { key: 'BAD\nVALUE' })}; throw 'unexpected_success' } catch { if ($_.Exception.Message -ne 'credential_format_invalid') { throw }; 'REJECTED' }`);
  assert.equal(output.trim(), 'REJECTED');
  assert.equal(existsSync(join(root, 'secrets/cos-id')), false);
  assert.equal(existsSync(join(root, 'trial.conf')), false);
}));
test('existing inputs and existing destination are never overwritten', { skip: !windows }, () => fixture(root => {
  const output = run(`New-PrivateDirectory ${quote(root)}; [void][IO.Directory]::CreateDirectory(${quote(join(root, 'secrets'))}); Write-NewPrivateText ${quote(join(root, 'secrets/cos-key'))} 'SENTINEL'; try { ${save(root)}; throw 'unexpected_success' } catch { if ($_.Exception.Message -ne 'inputs_already_exist') { throw } }; try { New-PrivateDirectory ${quote(root)}; throw 'unexpected_success' } catch { if ($_.Exception.Message -ne 'target_exists') { throw } }; 'REJECTED'`);
  assert.equal(output.trim(), 'REJECTED');
  assert.equal(readFileSync(join(root, 'secrets/cos-key'), 'utf8'), 'SENTINEL');
  assert.equal(existsSync(join(root, 'secrets/cos-id')), false);
}));

test('a destination appearing after the existence probe is never adopted or re-ACLd', { skip: !windows }, () => fixture(root => {
  const output = run(`[void][IO.Directory]::CreateDirectory(${quote(root)}); $before=(Get-Acl -LiteralPath ${quote(root)}).Sddl; function Test-Path { return $false }; try { New-PrivateDirectory ${quote(root)}; throw 'unexpected_success' } catch { if ($_.Exception.Message -ne 'private_directory_create_failed_or_exists') { throw } }; if ((Get-Acl -LiteralPath ${quote(root)}).Sddl -ne $before) { throw 'acl_changed' }; 'REJECTED'`);
  assert.equal(output.trim(), 'REJECTED');
}));
test('unsafe inherited ACL and junction path fail closed', { skip: !windows }, () => fixture((root, parent) => {
  const output = run(`try { Assert-PrivateDirectory ${quote(parent)}; throw 'unexpected_success' } catch { if ($_.Exception.Message -ne 'private_acl_required') { throw } }; New-PrivateDirectory ${quote(root)}; [void](New-Item -ItemType Junction -Path ${quote(join(parent, 'junction'))} -Target ${quote(root)}); try { Assert-NoReparsePath ${quote(join(parent, 'junction/new-file'))}; throw 'unexpected_success' } catch { if ($_.Exception.Message -ne 'unsafe_path') { throw } }; 'REJECTED'`);
  assert.equal(output.trim(), 'REJECTED');
}));
test('new synthetic localhost certificate has bounded validity/SAN/server-auth and remains untrusted', { skip: !windows }, () => fixture(root => {
  const output = run(`New-PrivateDirectory ${quote(root)}; [void][IO.Directory]::CreateDirectory(${quote(join(root, 'tls'))}); $m=New-LocalhostCertificate ${quote(root)}; $c=[Security.Cryptography.X509Certificates.X509Certificate2]::CreateFromPem([IO.File]::ReadAllText(${quote(join(root, 'tls/cert.pem'))})); try { $san=($c.Extensions | Where-Object {$_.Oid.Value -eq '2.5.29.17'}).Format($false); if ($san -notmatch 'localhost' -or $san -notmatch '127.0.0.1' -or $c.NotAfter -gt [DateTime]::Now.AddDays(31)) { throw 'certificate_invalid' }; $store=[Security.Cryptography.X509Certificates.X509Store]::new('Root','CurrentUser'); $store.Open('ReadOnly'); try { if ($store.Certificates.Find('FindByThumbprint',$c.Thumbprint,$false).Count -ne 0) { throw 'unexpected_trust_mutation' } } finally {$store.Close()}; @{result='PASS';shaLength=$m.sha256.Length} | ConvertTo-Json -Compress } finally {$c.Dispose()}`);
  assert.deepEqual(JSON.parse(output), { result: 'PASS', shaLength: 64 });
}));
