const COMMON_HEADERS = { 'Content-Type': 'text/plain; charset=utf-8' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        ...COMMON_HEADERS,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: COMMON_HEADERS, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const report = body['csp-report'] || body;

    console.warn('[CSP Violation]', JSON.stringify({
      blockedUri: report['blocked-uri'] || report.blockedURL || 'unknown',
      violatedDirective: report['violated-directive'] || report.effectiveDirective || 'unknown',
      documentUri: report['document-uri'] || report.documentURL || 'unknown',
      sourceFile: report['source-file'] || report.sourceFile || '',
      lineNumber: report['line-number'] || report.lineNumber || '',
      timestamp: new Date().toISOString()
    }));
  } catch (e) {
    console.warn('[CSP Violation] Failed to parse report:', e.message);
  }

  return { statusCode: 204, headers: COMMON_HEADERS, body: '' };
};
