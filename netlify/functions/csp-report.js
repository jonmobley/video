const COMMON_HEADERS = { 'Content-Type': 'text/plain; charset=utf-8' };

const reportCounts = new Map();
const MAX_REPORTS = 50;
const WINDOW_MS = 15 * 60 * 1000;

function isThrottled(ip) {
  const now = Date.now();
  let entry = reportCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
  }
  entry.count++;
  reportCounts.set(ip, entry);
  return entry.count > MAX_REPORTS;
}

function logViolation(report) {
  if (!report) return;
  console.warn('[CSP Violation]', JSON.stringify({
    blockedUri: report['blocked-uri'] || report.blockedURL || 'unknown',
    violatedDirective: report['violated-directive'] || report.effectiveDirective || 'unknown',
    documentUri: report['document-uri'] || report.documentURL || 'unknown',
    sourceFile: report['source-file'] || report.sourceFile || '',
    lineNumber: report['line-number'] || report.lineNumber || '',
    timestamp: new Date().toISOString()
  }));
}

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

  const ip = (event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown').split(',')[0].trim();
  if (isThrottled(ip)) {
    return { statusCode: 429, headers: COMMON_HEADERS, body: '' };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    if (Array.isArray(body)) {
      for (const entry of body) {
        logViolation(entry.body || entry);
      }
    } else {
      logViolation(body['csp-report'] || body);
    }
  } catch (e) {
    console.warn('[CSP Violation] Failed to parse report:', e.message);
  }

  return { statusCode: 204, headers: COMMON_HEADERS, body: '' };
};
