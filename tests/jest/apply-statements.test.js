const { applyStatements } = require('../../lib/apply-statements');
const { APP_SCHEMA_STATEMENTS } = require('../../lib/app-schema');
const { PAGE_SCHEMA_STATEMENTS } = require('../../lib/page-schema');

describe('applyStatements', () => {
  test('runs each statement as its own query', async () => {
    const sql = [];
    const db = { query: async (text) => { sql.push(text); } };
    await applyStatements(db, ['SELECT 1', '  ', 'SELECT 2']);
    expect(sql).toEqual(['SELECT 1', 'SELECT 2']);
  });

  test('app and page schema statements are single commands', () => {
    for (const sql of [...APP_SCHEMA_STATEMENTS, ...PAGE_SCHEMA_STATEMENTS]) {
      expect(sql.trim()).not.toMatch(/;\s*\S/);
    }
    expect(APP_SCHEMA_STATEMENTS.join('\n')).toMatch(/vs_auth_codes/);
    expect(PAGE_SCHEMA_STATEMENTS.join('\n')).toMatch(/page_config/);
  });
});
