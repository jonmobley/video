// Thin wrapper around Resend that fetches credentials from Replit's
// connector proxy on every call. Per Replit's guidance: never cache
// the client — tokens expire.
const { Resend } = require('resend');

let cachedSettings = null;

async function fetchConnectionSettings() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) throw new Error('X-Replit-Token not found for repl/depl');

  const res = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    { headers: { 'Accept': 'application/json', 'X-Replit-Token': xReplitToken } }
  );
  const data = await res.json();
  const item = data.items && data.items[0];
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
