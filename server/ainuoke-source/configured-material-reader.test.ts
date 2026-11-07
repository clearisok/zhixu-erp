import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPrivateMaterialConfirmations } from './configured-material-reader.js';

test('configured unit evidence is a private server file, never an implicit login or conversion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'material-reader-'));
  try {
    const file = join(root, 'evidence.json');
    await writeFile(file, '{"schemaVersion":"synthetic"}', { mode: 0o600 });
    assert.deepEqual(await readPrivateMaterialConfirmations(file), {schemaVersion:'synthetic'});
    await assert.rejects(readPrivateMaterialConfirmations('relative.json'), /material_confirmation_file_invalid/);
    await assert.rejects(readPrivateMaterialConfirmations(root), /material_confirmation_file_invalid/);
    if (process.platform !== 'win32') {
      await chmod(file, 0o644);
      await assert.rejects(readPrivateMaterialConfirmations(file), /material_confirmation_file_invalid/);
      await chmod(file, 0o600);
      const link = join(root, 'link.json'); await symlink(file, link);
      await assert.rejects(readPrivateMaterialConfirmations(link), /material_confirmation_file_invalid/);
    }
  } finally { await rm(root, {recursive:true,force:true}); }
});
