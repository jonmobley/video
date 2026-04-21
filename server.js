const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

// Ensure tables exist on startup
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      content_type TEXT NOT NULL,
      uploaded_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS video_chunks (
      video_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      data BYTEA NOT NULL,
      PRIMARY KEY (video_id, chunk_index)
    );
  `);
}

// Middleware
app.use(express.static(path.join(__dirname), {
  extensions: ['html']
}));
app.use(express.json({ limit: '8mb' }));

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// Upload a chunk
app.post('/api/upload-chunk', async (req, res) => {
  try {
    const { videoId, chunkIndex, totalChunks, data, contentType } = req.body;

    if (!videoId || chunkIndex === undefined || !totalChunks || !data || !contentType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const buffer = Buffer.from(data, 'base64');

    await pool.query(
      'INSERT INTO video_chunks (video_id, chunk_index, data) VALUES ($1, $2, $3) ON CONFLICT (video_id, chunk_index) DO UPDATE SET data = EXCLUDED.data',
      [videoId, chunkIndex, buffer]
    );

    res.json({ success: true, chunkIndex, totalChunks });
  } catch (err) {
    console.error('upload-chunk error:', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

// Finalize: assemble all chunks into one video row
app.post('/api/finalize-video', async (req, res) => {
  try {
    const { videoId, totalChunks, contentType } = req.body;

    if (!videoId || !totalChunks || !contentType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Read all chunks in order
    const result = await pool.query(
      'SELECT data FROM video_chunks WHERE video_id = $1 ORDER BY chunk_index ASC',
      [videoId]
    );

    if (result.rows.length !== totalChunks) {
      return res.status(400).json({
        error: `Expected ${totalChunks} chunks, got ${result.rows.length}`
      });
    }

    const assembled = Buffer.concat(result.rows.map(r => r.data));

    // Store assembled video metadata
    await pool.query(
      'INSERT INTO videos (id, content_type) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET content_type = EXCLUDED.content_type',
      [videoId, contentType]
    );

    // Store assembled data as a single chunk 0
    await pool.query(
      'DELETE FROM video_chunks WHERE video_id = $1',
      [videoId]
    );
    await pool.query(
      'INSERT INTO video_chunks (video_id, chunk_index, data) VALUES ($1, 0, $2)',
      [videoId, assembled]
    );

    res.json({ success: true, videoUrl: `/api/video/${encodeURIComponent(videoId)}` });
  } catch (err) {
    console.error('finalize-video error:', err);
    res.status(500).json({ error: err.message || 'Finalize failed' });
  }
});

// Serve a video
app.get('/api/video/:id', async (req, res) => {
  try {
    const videoId = req.params.id;

    const metaResult = await pool.query(
      'SELECT content_type FROM videos WHERE id = $1',
      [videoId]
    );

    if (metaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const { content_type } = metaResult.rows[0];

    const dataResult = await pool.query(
      'SELECT data FROM video_chunks WHERE video_id = $1 ORDER BY chunk_index ASC',
      [videoId]
    );

    if (dataResult.rows.length === 0) {
      return res.status(404).json({ error: 'Video data not found' });
    }

    const videoBuffer = Buffer.concat(dataResult.rows.map(r => r.data));
    const fileSize = videoBuffer.length;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': content_type,
        'Cache-Control': 'public, max-age=3600'
      });
      res.end(videoBuffer.slice(start, end + 1));
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': content_type,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600'
      });
      res.end(videoBuffer);
    }
  } catch (err) {
    console.error('get-video error:', err);
    res.status(500).json({ error: err.message || 'Could not load video' });
  }
});

// Clean URL redirects
app.get('/upload', (req, res) => res.sendFile(path.join(__dirname, 'upload.html')));
app.get('/watch', (req, res) => res.sendFile(path.join(__dirname, 'watch.html')));
app.get('/oz', (req, res) => res.sendFile(path.join(__dirname, 'oz.html')));
app.get('/disc', (req, res) => res.sendFile(path.join(__dirname, 'disc.html')));

// Start
ensureSchema()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`VidShare server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize schema:', err);
    process.exit(1);
  });
