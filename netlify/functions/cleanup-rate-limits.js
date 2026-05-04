const { createClient } = require('@supabase/supabase-js');

exports.handler = async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn('cleanup-rate-limits: Supabase not configured, skipping');
    return { statusCode: 200 };
  }

  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase.rpc('vs_cleanup_expired_rate_limits', {
      p_max_age_minutes: 120
    });

    if (error) {
      console.error('cleanup-rate-limits: RPC failed:', error.message);
      return { statusCode: 500 };
    }

    console.log(`cleanup-rate-limits: removed ${data} expired entries`);
    return { statusCode: 200 };
  } catch (err) {
    console.error('cleanup-rate-limits: error:', err.message);
    return { statusCode: 500 };
  }
};
