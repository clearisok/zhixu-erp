import { isDeepStrictEqual } from 'node:util';
// A UI-only upgrade changes exactly these non-secret fields. The complete resolved
// model stays inside the operator process; never log config/models on rejection.
export function projectUpdateConfig(text, identity) {
  const changes = { TRIAL_IMAGE: identity.image, TRIAL_COMMIT: identity.commit, TRIAL_BUILD_ID: identity.buildId, TRIAL_BUILD_TIME: identity.buildTime };
  if (!/^[a-f0-9]{40}$/.test(identity.commit) || !identity.image || !identity.buildId || !Number.isFinite(Date.parse(identity.buildTime))) throw Error('invalid_update_identity');
  const seen = new Set();
  const result = text.split(/\r?\n/).map(line => {
    const key = line.split('=')[0];
    if (!Object.hasOwn(changes, key)) return line;
    if (seen.has(key)) throw Error('duplicate_identity_field');
    seen.add(key); return key + '=' + changes[key];
  }).join(text.includes('\r\n') ? '\r\n' : '\n');
  if (seen.size !== 4) throw Error('missing_identity_field');
  return result;
}
export function verifyUpdateModels(before, after, oldIdentity, newIdentity) {
  const expected = structuredClone(before);
  for (const service of ['app', 'gateway']) {
    if (expected.services?.[service]?.image !== oldIdentity.image) throw Error('old_image_mismatch');
    expected.services[service].image = newIdentity.image;
  }
  const env = expected.services.app.environment;
  for (const [key, field] of Object.entries({ ZHIXU_GIT_COMMIT: 'commit', ZHIXU_BUILD_ID: 'buildId', ZHIXU_BUILD_TIME: 'buildTime' })) {
    if (env[key] !== oldIdentity[field]) throw Error('old_identity_mismatch');
    env[key] = newIdentity[field];
  }
  if (!isDeepStrictEqual(expected, after)) throw Error('unexpected_compose_change');
}
