/**
 * Multi-chunk video blob helpers.
 *
 * Uploads land as ordered rows in vs_upload_chunks. Finalize keeps those
 * chunks in place (no in-memory Buffer.concat) and records file_size on
 * vs_uploads. Serving maps byte ranges onto one or more chunk rows and
 * only loads the bytes needed for the response.
 */

async function sumChunkBytes(client, videoId) {
  const r = await client.query(
    `SELECT COALESCE(SUM(LENGTH(data)), 0)::bigint AS total,
            COUNT(*)::int AS cnt,
            MIN(chunk_index)::int AS min_idx,
            MAX(chunk_index)::int AS max_idx
       FROM vs_upload_chunks
      WHERE video_id = $1`,
    [videoId]
  );
  const row = r.rows[0];
  return {
    total: parseInt(row.total, 10) || 0,
    count: row.cnt || 0,
    minIdx: row.min_idx,
    maxIdx: row.max_idx
  };
}

async function listChunkSizes(client, videoId) {
  const r = await client.query(
    `SELECT chunk_index, LENGTH(data)::int AS size
       FROM vs_upload_chunks
      WHERE video_id = $1
      ORDER BY chunk_index ASC`,
    [videoId]
  );
  let offset = 0;
  return r.rows.map((row) => {
    const entry = {
      index: row.chunk_index,
      size: row.size,
      start: offset,
      end: offset + row.size // exclusive
    };
    offset += row.size;
    return entry;
  });
}

/**
 * Read [start, endInclusive] bytes across chunk rows without loading the
 * whole file. Returns a Buffer of the requested range.
 */
async function readByteRange(client, videoId, start, endInclusive) {
  const chunks = await listChunkSizes(client, videoId);
  if (!chunks.length) return null;
  const fileSize = chunks[chunks.length - 1].end;
  const from = Math.max(0, start);
  const to = Math.min(fileSize - 1, endInclusive);
  if (from > to) return Buffer.alloc(0);

  const parts = [];
  for (const c of chunks) {
    if (c.end <= from || c.start > to) continue;
    const localStart = Math.max(from, c.start) - c.start; // 0-based within chunk
    const localEnd = Math.min(to + 1, c.end) - c.start;   // exclusive
    const length = localEnd - localStart;
    if (length <= 0) continue;
    const r = await client.query(
      `SELECT SUBSTRING(data FROM $2::int FOR $3::int) AS chunk
         FROM vs_upload_chunks
        WHERE video_id = $1 AND chunk_index = $4`,
      [videoId, localStart + 1, length, c.index]
    );
    if (r.rows[0] && r.rows[0].chunk) parts.push(r.rows[0].chunk);
  }
  return Buffer.concat(parts);
}

/**
 * Stream the full file by writing each chunk buffer in order. Avoids holding
 * the assembled file in memory.
 */
async function streamAllChunks(client, videoId, res) {
  const r = await client.query(
    `SELECT chunk_index FROM vs_upload_chunks
      WHERE video_id = $1
      ORDER BY chunk_index ASC`,
    [videoId]
  );
  for (const row of r.rows) {
    const data = await client.query(
      `SELECT data FROM vs_upload_chunks WHERE video_id = $1 AND chunk_index = $2`,
      [videoId, row.chunk_index]
    );
    if (!data.rows.length) continue;
    const buf = data.rows[0].data;
    if (!res.write(buf)) {
      await new Promise((resolve) => res.once('drain', resolve));
    }
  }
  res.end();
}

module.exports = {
  sumChunkBytes,
  listChunkSizes,
  readByteRange,
  streamAllChunks
};
