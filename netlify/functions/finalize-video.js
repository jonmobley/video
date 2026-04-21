const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body);
    const { videoId, totalChunks, contentType } = body;

    if (!videoId || !totalChunks || !contentType) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    const store = getStore('video-uploads');

    // Read and concatenate all chunks in order
    const chunks = [];
    for (let i = 0; i < totalChunks; i++) {
      const chunkKey = `chunks/${videoId}/${String(i).padStart(6, '0')}`;
      const chunkBlob = await store.get(chunkKey, { type: 'arrayBuffer' });
      if (!chunkBlob) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: `Missing chunk ${i}` })
        };
      }
      chunks.push(Buffer.from(chunkBlob));
    }

    const assembled = Buffer.concat(chunks);

    // Store the assembled video
    await store.set(videoId, assembled, {
      metadata: { contentType, uploadedAt: new Date().toISOString() }
    });

    // Clean up chunks
    for (let i = 0; i < totalChunks; i++) {
      const chunkKey = `chunks/${videoId}/${String(i).padStart(6, '0')}`;
      await store.delete(chunkKey).catch(() => {});
    }

    const videoUrl = `/.netlify/blobs/video-uploads/${videoId}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, videoUrl })
    };
  } catch (err) {
    console.error('finalize-video error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Finalize failed' })
    };
  }
};
