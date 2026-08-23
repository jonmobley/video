const { requirePageAuth, getSecuredCorsHeaders } = require('./utils/auth');

exports.handler = async (event) => {
  const headers = getSecuredCorsHeaders();

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }
      })
    };
  }

  if (event.body && event.body.length > 16 * 1024) {
    return {
      statusCode: 413,
      headers,
      body: JSON.stringify({
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large.' }
      })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: { code: 'BAD_JSON', message: 'Request body is not valid JSON.' }
      })
    };
  }

  const authResult = requirePageAuth(event, body.page);
  if (!authResult.authorized) return authResult.response;

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ authorized: true, page: body.page })
  };
};