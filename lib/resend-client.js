// Resend client for magic-code emails. Credentials come from environment
// variables so the app can run anywhere (Docker, a VPS, Cloudflare Containers).
const { Resend } = require('resend');

function requireResendApiKey() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('RESEND_API_KEY is not set');
  }
  return apiKey.trim();
}

async function getResendClient() {
  return {
    client: new Resend(requireResendApiKey()),
    fromEmail: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
  };
}

function resendFromDomain() {
  const from = String(process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev');
  const match = from.match(/@([^>\s]+)/);
  return match ? match[1] : '';
}

function describeMailError(err) {
  const raw = err && err.message ? String(err.message) : 'send failed';
  return raw.replace(/re_[A-Za-z0-9]+/g, 're_***').slice(0, 200);
}

module.exports = { getResendClient, resendFromDomain, describeMailError };
