import test from 'node:test';
import assert from 'node:assert/strict';
import { publicAddress } from './public-smoke.mjs';

test('public proof refuses LAN, loopback, TUN fake IP and overlay addresses', () => {
  for (const ip of ['192.168.66.69', '198.18.0.104', '198.19.1.1', '100.80.138.58', '127.0.0.1',
    '10.0.0.1', '172.21.0.4', '169.254.1.1', '::1', 'fd00::1', 'fe80::1', '::ffff:192.168.66.69']) {
    assert.equal(publicAddress(ip), false, ip);
  }
  for (const ip of ['104.21.26.56', '172.67.135.143', '2606:4700::1']) assert.equal(publicAddress(ip), true, ip);
});
