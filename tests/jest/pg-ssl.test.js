const { postgresSslOption } = require('../../lib/pg-ssl');

describe('postgresSslOption', () => {
  const original = process.env.DATABASE_SSL;

  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_SSL;
    else process.env.DATABASE_SSL = original;
  });

  test('disables TLS for localhost', () => {
    delete process.env.DATABASE_SSL;
    expect(postgresSslOption('postgres://u:p@localhost:5432/vidshare')).toBe(false);
    expect(postgresSslOption('postgresql://u:p@127.0.0.1:5432/vidshare')).toBe(false);
  });

  test('disables TLS when sslmode=disable (Docker Compose hostname)', () => {
    delete process.env.DATABASE_SSL;
    expect(postgresSslOption('postgres://vidshare:vidshare@db:5432/vidshare?sslmode=disable')).toBe(false);
  });

  test('uses opportunistic TLS for hosted Postgres', () => {
    delete process.env.DATABASE_SSL;
    expect(postgresSslOption('postgres://u:p@db.example.supabase.co:5432/postgres')).toEqual({
      rejectUnauthorized: false
    });
  });

  test('DATABASE_SSL env overrides the URL', () => {
    process.env.DATABASE_SSL = 'false';
    expect(postgresSslOption('postgres://u:p@db.example.supabase.co:5432/postgres')).toBe(false);
    process.env.DATABASE_SSL = 'true';
    expect(postgresSslOption('postgres://u:p@localhost:5432/vidshare')).toEqual({
      rejectUnauthorized: false
    });
  });
});
