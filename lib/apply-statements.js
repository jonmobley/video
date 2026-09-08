async function applyStatements(db, statements) {
  for (const sql of statements) {
    const text = String(sql).trim();
    if (!text) continue;
    await db.query(text);
  }
}

module.exports = { applyStatements };
