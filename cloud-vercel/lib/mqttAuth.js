import { createHash, createHmac, timingSafeEqual } from 'crypto';


function sign(secret, message) {
  return createHmac('sha256', secret).update(message).digest('hex');
}

function safeEqualHex(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function commandMessage(payload, storeId) {
  return [
    payload.requestId || '',
    storeId,
    payload.commandKey || '',
    String(payload.timestamp || ''),
    payload.nonce || '',
    payload.confirm ? '1' : '0',
  ].join('\n');
}

export function signCommand(payload, storeId, secret) {
  return sign(secret, commandMessage(payload, storeId));
}

export function responseMessage(payload) {
  const digest = createHash('sha256').update(payload.resultJson || '').digest('hex');
  return [
    payload.requestId || '',
    payload.storeId || '',
    String(payload.timestamp || ''),
    payload.ok === true ? '1' : '0',
    digest,
    payload.error || '',
  ].join('\n');
}

export function verifyResponse(payload, secret) {
  if (!secret || !payload?.signature) return false;
  return safeEqualHex(sign(secret, responseMessage(payload)), payload.signature);
}
