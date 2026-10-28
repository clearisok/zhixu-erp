import assert from 'node:assert/strict';
import { assertTrialSubnetsClear } from '../../ops/quote-trial/subnet-policy.mjs';
export { assertTrialSubnetsClear, allocateTrialSubnets } from '../../ops/quote-trial/subnet-policy.mjs';
export function renderOwnedNetworkOverride(original, project, subnets) {
  assert.match(project, /^zhixu-quote-trial-(?:it|recovery)-[a-f0-9]{10}$/u, 'new_owned_project_required');
  assert.equal(typeof original, 'string');
  assert.ok(original.length < 65536 && !/^networks\s*:/mu.test(original), 'original_override_networks_must_not_be_replaced');
  assert.equal(subnets.length, 2, 'default_and_ingress_subnets_required'); assertTrialSubnetsClear(subnets, []);
  return original + '\n# New owned project only: bounded non-overlapping IPv4 ranges.\nnetworks:\n  default:\n    ipam:\n      config:\n        - subnet: ' + subnets[0] + '\n  ingress:\n    ipam:\n      config:\n        - subnet: ' + subnets[1] + '\n';
}
