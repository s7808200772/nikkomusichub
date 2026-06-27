import assert from 'node:assert/strict';
import test from 'node:test';

import { signCommand, verifyResponse } from '../lib/mqttAuth.js';

const secret = 'test-secret-123';

test('command signature matches the Pi implementation vector', () => {
  const command = {
    requestId: 'req-123',
    commandKey: 'status_dashboard',
    timestamp: 1782595000000,
    nonce: 'nonce-456',
  };
  assert.equal(
    signCommand(command, 'store-001', secret),
    '6b75f2521a116d4665daabb321bdcd753634568460a18caffdc4898c3673e97e'
  );
});

test('response verification accepts canonical data and rejects tampering', () => {
  const response = {
    requestId: 'req-123',
    storeId: 'store-001',
    timestamp: 1782595001,
    ok: true,
    result: { b: 2, a: ['x', 1] },
    signature: 'beb5b24a5bbefb8c7561425c93939e8ceff13e969c919435c0cd319af31ca6b1',
  };
  assert.equal(verifyResponse(response, secret), true);
  response.result.b = 3;
  assert.equal(verifyResponse(response, secret), false);
});
