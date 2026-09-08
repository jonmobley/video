const { Pool } = require('pg');
const { postgresSslOption } = require('./pg-ssl');
const { applyPageSchema } = require('./page-schema');

let pool;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured.');
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: postgresSslOption(process.env.DATABASE_URL)
    });
  }
  return pool;
}

function query(text, values) {
  return getPool().query(text, values);
}

// Safe to run on every standalone server boot. ALTER statements make this work
// for databases originally created from the old Supabase schema as well.
async function ensurePageSchema(db = getPool()) {
  // One statement per query so Supabase transaction poolers (port 6543)
  // can apply DDL. A multi-statement string fails there and rolls back
  // vs_auth_codes / page_config columns.
  await applyPageSchema(db);
}

module.exports = { getPool, query, ensurePageSchema };