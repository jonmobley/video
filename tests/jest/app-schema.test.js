const { applyAppSchema, migrateLegacyPasswords } = require('../../lib/app-schema');
const { ensurePageSchema } = require('../../lib/page-store');

describe('schema bootstrap', () => {
  test('applyAppSchema issues one query per statement', async () => {
    const sql = [];
    await applyAppSchema({ query: async (text) => { sql.push(text); return { rows: [] }; } });
    expect(sql.length).toBeGreaterThan(10);
    expect(sql.some((s) => s.includes('vs_auth_codes'))).toBe(true);
    expect(sql.every((s) => !/;\s*\S/.test(s.trim()))).toBe(true);
  });

  test('ensurePageSchema issues one query per statement', async () => {
    const sql = [];
    await ensurePageSchema({ query: async (text) => { sql.push(text); return { rows: [] }; } });
    expect(sql.length).toBeGreaterThan(5);
    expect(sql.some((s) => s.includes('presentation'))).toBe(true);
  });

  test('migrateLegacyPasswords is a no-op without password_hash', async () => {
    const sql = [];
    await migrateLegacyPasswords({
      query: async (text) => {
        sql.push(text);
        return { rows: [] };
      }
    });
    expect(sql).toHaveLength(1);
    expect(sql[0]).toMatch(/password_hash/);
  });
});
