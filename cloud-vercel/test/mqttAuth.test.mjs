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
    confirm: false,
  };
  assert.equal(
    signCommand(command, 'store-001', secret),
    '07c010b65338b6984bd5fd6e32488b909ad67c95071d0b972005dc4c1c4e3c70'
  );
});

test('response verification accepts exact signed payload and rejects tampering', () => {
  const response = {
    requestId: 'req-123',
    storeId: 'store-001',
    timestamp: 1782595001,
    ok: true,
    resultJson: '{"a":["x",1],"b":2}',
    error: null,
    signature: 'f3f5691c4d9758d87d3525f011d0d075842b66c667054109e8aa91cb34174129',
  };
  assert.equal(verifyResponse(response, secret), true);
  response.resultJson = '{"a":["x",1],"b":3}';
  assert.equal(verifyResponse(response, secret), false);
});