const { readByteRange, listChunkSizes } = require('../../lib/video-chunks');

function makeClient(chunks) {
  // chunks: [{ index, data: Buffer }]
  return {
    async query(sql, params) {
      if (sql.includes('LENGTH(data)') && sql.includes('ORDER BY chunk_index')) {
        let offset = 0;
        const rows = chunks.map((c) => {
          const size = c.data.length;
          const row = { chunk_index: c.index, size };
          offset += size;
          return row;
        });
        return { rows };
      }
      if (sql.includes('SUBSTRING')) {
        const [, start1, length, index] = params;
        const chunk = chunks.find((c) => c.index === index);
        const start0 = start1 - 1;
        return { rows: [{ chunk: chunk.data.subarray(start0, start0 + length) }] };
      }
      return { rows: [] };
    }
  };
}

describe('lib/video-chunks', () => {
  test('readByteRange spans multiple chunks without loading unused bytes', async () => {
    const a = Buffer.from('AAAA');
    const b = Buffer.from('BBBBCCCC');
    const c = Buffer.from('DD');
    const client = makeClient([
      { index: 0, data: a },
      { index: 1, data: b },
      { index: 2, data: c }
    ]);
    const sizes = await listChunkSizes(client, 'vid');
    expect(sizes.map((s) => s.size)).toEqual([4, 8, 2]);

    const mid = await readByteRange(client, 'vid', 2, 9);
    // AAAA|BBBBCCCC|DD → indices 2..9 = "AABBBBCC"
    expect(mid.toString()).toBe('AABBBBCC');
  });
});
