function postgresSslOption(connectionString) {
  const explicit = process.env.DATABASE_SSL;
  if (explicit === '0' || explicit === 'false') return false;
  if (explicit === '1' || explicit === 'true') return { rejectUnauthorized: false };

  const url = String(connectionString || '');
  if (!url) return false;
  if (/[?&]sslmode=(disable|allow)\b/i.test(url)) return false;

  let host = '';
  try {
    host = new URL(url.replace(/^postgres(ql)?:/i, 'http:')).hostname;
  } catch {
    host = '';
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
  if (url.includes('localhost')) return false;
  return { rejectUnauthorized: false };
}

module.exports = { postgresSslOption };
