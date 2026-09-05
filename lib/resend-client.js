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

module.exports = { getResendClient };
