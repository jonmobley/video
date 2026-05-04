const { createClient } = require('@supabase/supabase-js');

let _supabase = null;

function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    _supabase = createClient(url, key);
  } catch {
    return null;
  }
  return _supabase;
}

function getClientIp(event) {
  const nfIp = event.headers['x-nf-client-connection-ip'];
  if (nfIp) return nfIp;
  const clientIp = event.headers['client-ip'];
  if (clientIp) return clientIp;
  return 'unknown';
}

async function checkRateLimit(ip, action, maxRequests, windowMinutes) {
  const sb = getSupabase();
  if (!sb) {
    console.error('rate-limit: Supabase not configured — blocking request (fail-closed)');
    return { limited: true, retryAfter: 60 };
  }

  const key = `${action}:${ip}`;

  try {
    const { data, error } = await sb.rpc('vs_check_rate_limit', {
      p_key: key,
      p_max_requests: maxRequests,
      p_window_minutes: windowMinutes
    });

    if (error) {
      console.error('rate-limit: Supabase RPC failed — blocking request (fail-closed):', error.message);
      return { limited: true, retryAfter: 60 };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      console.error('rate-limit: RPC returned no data — blocking request (fail-closed)');
      return { limited: true, retryAfter: 60 };
    }

    if (row.is_limited) {
      return { limited: true, retryAfter: row.retry_after_seconds };
    }
    return { limited: false };
  } catch (err) {
    console.error('rate-limit: check failed — blocking request (fail-closed):', err.message);
    return { limited: true, retryAfter: 60 };
  }
}

function rateLimitResponse(headers, retryAfter) {
  return {
    statusCode: 429,
    headers: { ...headers, 'Retry-After': String(retryAfter) },
    body: JSON.stringify({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.'
      }
    })
  };
}

module.exports = { checkRateLimit, getClientIp, rateLimitResponse };
