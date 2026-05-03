// Thin wrapper around Resend that fetches credentials from Replit's
// connector proxy on every call. Per Replit's guidance: never cache
// the client — tokens expire.
const { Resend } = require('resend');

let cachedSettings = null;

async function fetchConnectionSettings() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  if (!hostname) {
    throw new Error('Resend connector unavailable: REPLIT_CONNECTORS_HOSTNAME not set');
  }
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;
  if (!xReplitToken) {
    throw new Error('Resend connector unavailable: no REPL_IDENTITY or WEB_REPL_RENEWAL token');
  }

  const res = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    { headers: { 'Accept': 'application/json', 'X-Replit-Token': xReplitToken } }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend connector lookup failed: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  const data = await res.json().catch(() => ({}));
  const item = data && data.items && data.items[0];
  if (!item || !item.settings || !item.settings.api_key) {
    throw new Error('Resend not connected');
  }
  return item.settings;
}

async function getResendClient() {
  cachedSettings = await fetchConnectionSettings();
  return {
    client: new Resend(cachedSettings.api_key),
    fromEmail: cachedSettings.from_email || 'onboarding@resend.dev',
  };
}

module.exports = { getResendClient };
