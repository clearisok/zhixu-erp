import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

/** Exercise the real SDK with an in-memory synthetic transport. No real login. */
export function captureItMaterialFixture() {
  const child = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c',
    "import sys,json;sys.path.insert(0,'tests');from test_it_material import capture;print(json.dumps(capture()[0],ensure_ascii=False))"],
  { cwd: resolve('tools/ainuoke-bridge'), encoding: 'utf8', windowsHide: true, timeout: 15000,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' } });
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}
