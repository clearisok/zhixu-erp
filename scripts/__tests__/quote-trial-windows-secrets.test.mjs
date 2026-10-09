// Only unique fake credential resources, offline. Never the actual win01 directory/volume.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
const image = 'zhixu-quote-trial:9ee254db89c6';
const docker = args => execFileSync('docker', args, { encoding: 'utf8', timeout: 30000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
test('Windows fake files -> owned Linux 1000:1000/0600 read-only volume -> canonical offline loader', { timeout: 90000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhixu-secret-volume-test-'));
  const volume = `zhixu-quote-trial-secretcheck-${randomBytes(6).toString('hex')}_secrets`;
  let created = false;
  try {
    assert.equal(docker(['image', 'inspect', '--format', '{{.Id}}', image]), 'sha256:c496a93c3f895448f65b3ede533105dc832c6be8ec61682badece39cb32a3d57');
    assert.ok(!docker(['volume', 'ls', '--format', '{{.Name}}']).split(/\r?\n/).includes(volume));
    writeFileSync(join(dir, 'cos-id'), 'SYNTHETIC-ID\n');
    writeFileSync(join(dir, 'cos-key'), 'SYNTHETIC-KEY\n');
    writeFileSync(join(dir, 'cos.conf'), 'ZHIXU_ATTACHMENT_STORAGE=s3\nZHIXU_ATTACHMENT_S3_ENDPOINT=https://objects.invalid\nZHIXU_ATTACHMENT_S3_REGION=ap-hongkong\nZHIXU_ATTACHMENT_S3_BUCKET=synthetic-only\nZHIXU_ATTACHMENT_S3_FORCE_PATH_STYLE=false\nZHIXU_ATTACHMENT_S3_ACCESS_KEY_ID_FILE=/run/secrets/cos-id\nZHIXU_ATTACHMENT_S3_SECRET_ACCESS_KEY_FILE=/run/secrets/cos-key\n');
    docker(['volume', 'create', '--label', 'io.zhixu.purpose=disposable-fake-secrets-test', volume]); created = true;
    docker(['run', '--rm', '--network', 'none', '--user', '0:0', '--mount', `type=volume,source=${volume},target=/secrets`, '--mount', `type=bind,source=${dir},target=/seed,readonly`, image,
      'sh', '-c', 'cp /seed/cos-id /secrets/cos-id && cp /seed/cos-key /secrets/cos-key && chown 1000:1000 /secrets/cos-id /secrets/cos-key && chmod 600 /secrets/cos-id /secrets/cos-key']);
    const args = ['run', '--rm', '--network', 'none', '--user', '1000:1000', '--mount', `type=volume,source=${volume},target=/run/secrets,readonly`, '--mount', `type=bind,source=${dir}/cos.conf,target=/cos.conf,readonly`, image];
    assert.equal(docker([...args, 'stat', '-c', '%u:%g:%a', '/run/secrets/cos-id', '/run/secrets/cos-key']), '1000:1000:600\n1000:1000:600');
    const result = JSON.parse(docker([...args, 'node', 'dist/server/server/attachments/check-config-cli.js', '--config', '/cos.conf']));
    assert.equal(result.result, 'PASS');
    assert.equal(result.storage, 's3');
    assert.equal(result.networkContacted, false);
    assert.equal(result.databaseContacted, false);
    assert.equal(result.permissionsVerified, false);
    assert.deepEqual(Object.values(result.credentialSources), ['file', 'file']);
    assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC-ID|SYNTHETIC-KEY/);
    // Read-only mount must reject writes even for the owning non-root user.
    assert.throws(() => docker([...args, 'sh', '-c', 'printf x >> /run/secrets/cos-id']));
  } finally {
    if (created) {
      assert.match(volume, /^zhixu-quote-trial-secretcheck-[a-f0-9]{12}_secrets$/);
      assert.equal(docker(['volume', 'inspect', '--format', '{{index .Labels "io.zhixu.purpose"}}', volume]), 'disposable-fake-secrets-test');
      docker(['volume', 'rm', volume]);
      assert.ok(!docker(['volume', 'ls', '--format', '{{.Name}}']).split(/\r?\n/).includes(volume));
    }
    assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/')));
    rmSync(dir, { recursive: true, force: true });
  }
});
