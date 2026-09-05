function cookieSecureEnabled(req) {
  const explicit = process.env.COOKIE_SECURE;
  if (explicit === '0' || explicit === 'false') return false;
  if (explicit === '1' || explicit === 'true') return true;
  if (req && typeof req.secure === 'boolean') return req.secure;
  return process.env.NODE_ENV === 'production';
}

module.exports = { cookieSecureEnabled };
