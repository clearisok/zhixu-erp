import { canonicalPlanJson } from '../../../server/production-scheduling/canonical-json';
/** Input is normalized by its existing domain command parser before hashing. */
export async function closingRequestHash(command: object) {
  const bytes = new TextEncoder().encode(canonicalPlanJson(command));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
}
