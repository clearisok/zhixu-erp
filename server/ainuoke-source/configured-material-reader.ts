import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { Pool } from 'pg';
import { createLocalConfirmedMaterialPorts } from './local-unit-confirmations.js';
import { createPersistedMaterialPorts, type SourceReadConfig } from './reader.js';

/** Optional, server-owned evidence file. It supplies no identity or permission. */
export async function readPrivateMaterialConfirmations(path: string): Promise<unknown> {
  if (!isAbsolute(path)) throw new Error('material_confirmation_file_invalid');
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 8 * 1024 * 1024
    || process.platform !== 'win32' && ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.())) {
    throw new Error('material_confirmation_file_invalid');
  }
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
}

export async function createConfiguredMaterialPorts(pool: Pool, config: SourceReadConfig,
  values: Readonly<Record<string, string | undefined>>, onInvalid: () => void) {
  const path = values.ZHIXU_AINUOKE_UNIT_CONFIRMATIONS_FILE;
  if (!path) return createPersistedMaterialPorts(pool, config);
  if (!isAbsolute(path)) throw new Error('material_confirmation_file_invalid');
  const profile = (await pool.query('SELECT account_fingerprint FROM ainuoke_source_profiles WHERE source_key=$1', [config.sourceKey])).rows[0];
  if (!profile || !/^[a-f0-9]{64}$/.test(profile.account_fingerprint)) throw new Error('confirmation_source_mismatch');
  // Reuse the same RR reader and exact source/account/order/evidence matching
  // as the accepted local version. No demo-login handler is installed here.
  return createLocalConfirmedMaterialPorts(pool, config, {
    accountFingerprint: profile.account_fingerprint,
    read: () => readPrivateMaterialConfirmations(path), onInvalid,
  });
}
