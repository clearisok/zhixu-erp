import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateTrialSubnets, assertTrialSubnetsClear, renderOwnedNetworkOverride } from './persistent-network-fixture.mjs';

test('bounded plan ignores the default route but avoids host and Docker ranges', () => {
  const blocked = ['0.0.0.0/0', '10.253.240.0/24', '10.253.241.16/28', '172.16.0.0/12'];
  assert.deepEqual(allocateTrialSubnets(blocked), ['10.253.241.0/28', '10.253.241.32/28', '10.253.241.48/28', '10.253.241.64/28']);
});
test('all pools occupied rejects rather than using unreviewed public space', () => {
  assert.throws(() => allocateTrialSubnets(['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']), /owned_private_subnets_unavailable/u);
});
test('candidate fallback is deterministic and remains in private pools', () => {
  assert.deepEqual(allocateTrialSubnets(['10.0.0.0/8'], 2), ['172.31.240.0/28', '172.31.240.16/28']);
  assert.deepEqual(allocateTrialSubnets(['10.0.0.0/8', '172.16.0.0/12'], 1), ['192.168.240.0/28']);
});
test('nested, equal and containing reservations reject; adjacent ranges are allowed', () => {
  for (const blocked of ['10.253.240.0/28', '10.253.240.2/32', '10.253.240.0/24']) assert.throws(() => assertTrialSubnetsClear(['10.253.240.0/28'], [blocked]), /owned_subnet_overlap/u);
  assert.doesNotThrow(() => assertTrialSubnetsClear(['10.253.240.16/28'], ['10.253.240.0/28']));
  assert.throws(() => assertTrialSubnetsClear(['10.253.240.0/28', '10.253.240.0/28'], []), /owned_subnet_overlap/u);
});
test('malformed, noncanonical and unbounded observations fail closed', () => {
  for (const value of ['10.1.2.999/28', '10.1.2.0/33', '010.1.2.0/28', '10.1.2.1/28', '::/0', '10.1.2.0', null]) assert.throws(() => allocateTrialSubnets([value]));
  assert.throws(() => allocateTrialSubnets(Array(4097).fill('0.0.0.0/0')));
  for (const count of [0, -1, 17, 1.5, '4']) assert.throws(() => allocateTrialSubnets([], count));
});
test('fresh observations catch a subnet reserved after planning', () => {
  const planned = allocateTrialSubnets([]);
  assert.throws(() => assertTrialSubnetsClear(planned, [planned[2]]), /owned_subnet_overlap/u);
});
test('only owned project /28s can be rendered without replacing original override bytes', () => {
  const original = 'services:\n  app:\n    volumes:\n      - ./object-bundle.mjs:/trial/object-bundle.mjs:ro\n';
  const subnets = allocateTrialSubnets([], 2), result = renderOwnedNetworkOverride(original, 'zhixu-quote-trial-it-0123456789', subnets);
  assert.ok(result.startsWith(original)); assert.equal((result.match(/^networks:/gmu) ?? []).length, 1); assert.equal((result.match(/subnet:/gu) ?? []).length, 2);
  assert.ok(result.includes('subnet: 10.253.240.0/28')); assert.ok(result.includes('subnet: 10.253.240.16/28'));
  for (const project of ['existing-project', 'zhixu-quote-trial-it-owned', 'zhixu-quote-trial-user-0123456789']) assert.throws(() => renderOwnedNetworkOverride(original, project, subnets));
  assert.throws(() => renderOwnedNetworkOverride(original + '\nnetworks:\n  default: {}\n', 'zhixu-quote-trial-recovery-0123456789', subnets));
  for (const selected of [['8.8.8.0/28', subnets[1]], ['10.253.240.0/24', subnets[1]], [subnets[0], subnets[0]]]) assert.throws(() => renderOwnedNetworkOverride(original, 'zhixu-quote-trial-it-0123456789', selected));
});
