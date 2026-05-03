// Shared jest.mock factory for the `pg` module. We never want tests to touch
// a real Postgres — every endpoint under test is exercised either entirely
// before the first DB call (validation paths) or with explicit query stubs
// pushed onto the queue by the individual test (finalize integrity tests).

const queryQueue = [];
const callLog = [];

function reset() {
  queryQueue.length = 0;
  callLog.length = 0;
}

function enqueue(result) {
  queryQueue.push(result);
}

function calls() {
  return callLog.slice();
}

async function runQuery(sql, params) {
  callLog.push({ sql: typeof sql === 'string' ? sql : String(sql), params: params || [] });
  if (queryQueue.length === 0) {
    // Validation tests should never reach here. If they do, fail loudly so the
    // test author notices instead of silently returning empty rows.
    throw new Error('pg-mock: unexpected query — none queued. SQL: ' + String(sql).slice(0, 120));
  }
  const next = queryQueue.shift();
  if (next instanceof Error) throw next;
  return next;
}

class FakeClient {
  query(sql, params) { return runQuery(sql, params); }
  release() {}
}

class FakePool {
  constructor() {}
  query(sql, params) { return runQuery(sql, params); }
  async connect() { return new FakeClient(); }
  on() {}
  end() {}
}

module.exports = {
  reset,
  enqueue,
  calls,
  install() {
    return {
      Pool: FakePool,
      types: { setTypeParser: () => {} }
    };
  }
};
