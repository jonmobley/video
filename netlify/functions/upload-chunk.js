const { getStore } = require('@netlify/blobs');

const MAX_CHUNK_SIZE = 4 * 1024 * 1024; // 4MB base64 string max

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
    const { videoId, chunkIndex, totalChunks, data, contentType } = body;

    if (!videoId || chunkIndex === undefined || !totalChunks || !data || !contentType) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    if (data.length > MAX_CHUNK_SIZE * 1.4) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Chunk too large' })
      };
    }

    const chunkBuffer = Buffer.from(data, 'base64');
    const store = getStore('video-uploads');
    const chunkKey = `chunks/${videoId}/${String(chunkIndex).padStart(6, '0')}`;

    await store.set(chunkKey, chunkBuffer, {
      metadata: { contentType, chunkIndex, totalChunks, videoId }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, chunkIndex, totalChunks })
    };
  } catch (err) {
    console.error('upload-chunk error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Upload failed' })
    };
  }
};
