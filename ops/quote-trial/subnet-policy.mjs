// Pure, bounded subnet planning shared by local target previews and recovery rehearsals. This never
// changes Docker defaults, host routes, existing networks or shared settings.
import assert from 'node:assert/strict';

const pools = ['10.253.240.0/20', '172.31.240.0/20', '192.168.240.0/20'];
function cidr(value) {
  assert.equal(typeof value, 'string', 'invalid_ipv4_cidr');
  const match = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\/(0|[1-9]\d?)$/u.exec(value);
  assert.ok(match, 'invalid_ipv4_cidr');
  const octets = match.slice(1, 5).map(Number), prefix = Number(match[5]);
  assert.ok(octets.every(n => n <= 255) && prefix <= 32, 'invalid_ipv4_cidr');
  const address = octets.reduce((total, part) => total * 256 + part, 0), size = 2 ** (32 - prefix), start = Math.floor(address / size) * size;
  assert.equal(address, start, 'noncanonical_ipv4_cidr');
  return { start, end: start + size - 1, prefix, value };
}
const overlap = (a, b) => a.start <= b.end && b.start <= a.end;
const text = address => [24, 16, 8, 0].map(shift => Math.floor(address / 2 ** shift) % 256).join('.');
function observations(values) {
  assert.ok(Array.isArray(values) && values.length <= 4096, 'bounded_ipv4_observations_required');
  // A default route is not a reservation of the entire IPv4 address space.
  return values.map(cidr).filter(value => value.prefix !== 0);
}
export function assertTrialSubnetsClear(selected, blocked) {
  assert.ok(Array.isArray(selected) && selected.length >= 1 && selected.length <= 16, 'bounded_owned_subnets_required');
  const ranges = selected.map(cidr), reserved = observations(blocked), candidates = pools.map(cidr);
  for (const [index, range] of ranges.entries()) {
    assert.ok(range.prefix === 28 && candidates.some(pool => pool.start <= range.start && range.end <= pool.end), 'owned_private_pool_required');
    assert.ok(!reserved.some(other => overlap(range, other)) && !ranges.slice(0, index).some(other => overlap(range, other)), 'owned_subnet_overlap');
  }
}
export function allocateTrialSubnets(blocked, count = 4) {
  assert.ok(Number.isSafeInteger(count) && count >= 1 && count <= 16, 'bounded_owned_subnet_count_required');
  const reserved = observations(blocked), selected = [];
  for (const pool of pools.map(cidr)) for (let start = pool.start; start <= pool.end; start += 16) {
    if (!reserved.some(other => overlap({ start, end: start + 15 }, other))) selected.push(text(start) + '/28');
    if (selected.length === count) { assertTrialSubnetsClear(selected, blocked); return selected; }
  }
  throw Error('owned_private_subnets_unavailable');
}
