/**
 * Video password hashing + short-lived access tokens.
 *
 * Hashes use scrypt with a random salt (format: scrypt$N$r$p$saltHex$hashHex).
 * Legacy sha256("vs2026_" + pw) hex digests are still accepted for reads so
 * existing protected videos keep working; new writes always use scrypt.
 *
 * After a successful password check the client receives an HMAC access token
 * (`t` query param) instead of echoing the cleartext password on media URLs.
 */
const crypto = require('crypto');

const LEGACY_PEPPER = 'vs2026_';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const SCRYPT_SALT_BYTES = 16;
const ACCESS_TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function legacyHash(pw) {
  return crypto.createHash('sha256').update(LEGACY_PEPPER + pw).digest('hex');
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES);
  const hash = crypto.scryptSync(String(pw), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function passwordsMatch(provided, storedHash) {
  if (!provided || !storedHash || typeof storedHash !== 'string') return false;
  const pw = String(provided);

  if (storedHash.startsWith('scrypt$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 6) return false;
    const N = parseInt(parts[1], 10);
    const r = parseInt(parts[2], 10);
    const p = parseInt(parts[3], 10);
    const salt = Buffer.from(parts[4], 'hex');
    const expected = Buffer.from(parts[5], 'hex');
    if (!salt.length || !expected.length || !N || !r || !p) return false;
    let actual;
    try {
      actual = crypto.scryptSync(pw, salt, expected.length, { N, r, p });
    } catch {
      return false;
    }
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  // Legacy sha256 hex digest.
  const a = Buffer.from(legacyHash(pw));
  const b = Buffer.from(storedHash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function fromB64url(str) {
  return Buffer.from(String(str), 'base64url');
}

function signAccessToken(videoId, secret, ttlMs = ACCESS_TOKEN_TTL_MS) {
  if (!secret) throw new Error('session secret required for access tokens');
  const exp = Date.now() + ttlMs;
  // Use JSON so video ids containing "." (e.g. foo.mp4) stay unambiguous.
  const payload = b64url(JSON.stringify({ id: String(videoId), exp }));
  const sig = crypto.createHmac('sha256', secret).update(payload).digest();
  return `${payload}.${b64url(sig)}`;
}

function verifyAccessToken(videoId, token, secret) {
  if (!token || !secret || !videoId) return false;
  const parts = String(token).split('.');
  if (parts.length !== 2) return false;
  let parsed;
  try {
    parsed = JSON.parse(fromB64url(parts[0]).toString('utf8'));
  } catch {
    return false;
  }
  const expectedSig = crypto.createHmac('sha256', secret).update(parts[0]).digest();
  let actualSig;
  try {
    actualSig = fromB64url(parts[1]);
  } catch {
    return false;
  }
  if (actualSig.length !== expectedSig.length || !crypto.timingSafeEqual(actualSig, expectedSig)) {
    return false;
  }
  if (!parsed || parsed.id !== videoId) return false;
  const exp = Number(parsed.exp);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return true;
}

function authorizeVideoAccess(videoId, passwordHash, query, secret) {
  if (!passwordHash) return true;
  const q = query || {};
  if (q.t && verifyAccessToken(videoId, q.t, secret)) return true;
  // Legacy cleartext ?pt= still accepted so old bookmarked streams keep
  // working; new clients use signed tokens only.
  if (q.pt && passwordsMatch(q.pt, passwordHash)) return true;
  return false;
}

module.exports = {
  hashPassword,
  passwordsMatch,
  signAccessToken,
  verifyAccessToken,
  authorizeVideoAccess,
  ACCESS_TOKEN_TTL_MS,
  legacyHash
};
