const stepEmail = document.getElementById('stepEmail');
const stepCode  = document.getElementById('stepCode');
const emailForm = document.getElementById('emailForm');
const codeForm  = document.getElementById('codeForm');
const emailEl   = document.getElementById('email');
const codeEl    = document.getElementById('code');
const emailEcho = document.getElementById('emailEcho');
const emailErr  = document.getElementById('emailError');
const codeErr   = document.getElementById('codeError');
const codeInfo  = document.getElementById('codeInfo');
const emailBtn  = document.getElementById('emailSubmit');
const codeBtn   = document.getElementById('codeSubmit');
const resendBtn = document.getElementById('resendBtn');
const changeBtn = document.getElementById('changeEmailBtn');

let currentEmail = '';

function show(el, msg) { el.textContent = msg; el.classList.add('visible'); }
function hide(el)      { el.classList.remove('visible'); }

function goToStep(which) {
  stepEmail.classList.toggle('active', which === 'email');
  stepCode.classList.toggle('active', which === 'code');
  hide(emailErr); hide(codeErr); hide(codeInfo);
  if (which === 'code') setTimeout(() => codeEl.focus(), 50);
  else setTimeout(() => emailEl.focus(), 50);
}

function errMsg(data, fallback) {
  if (!data) return fallback;
  if (data.error && typeof data.error === 'object') return data.error.message || fallback;
  if (typeof data.error === 'string') return data.error;
  return fallback;
}

async function requestCode(email) {
  const res = await fetch('/api/auth/request-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

emailForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hide(emailErr);
  const email = emailEl.value.trim().toLowerCase();
  if (!email) return;
  emailBtn.disabled = true;
  const original = emailBtn.textContent;
  emailBtn.textContent = 'Sending\u2026';
  const { ok, data } = await requestCode(email).catch(() => ({ ok: false, data: {} }));
  emailBtn.disabled = false; emailBtn.textContent = original;
  if (!ok) {
    show(emailErr, errMsg(data, 'Could not send code. Please try again.'));
    return;
  }
  currentEmail = email;
  emailEcho.textContent = email;
  codeEl.value = '';
  goToStep('code');
});

codeEl.addEventListener('input', () => {
  codeEl.value = codeEl.value.replace(/\D/g, '').slice(0, 6);
});

codeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hide(codeErr); hide(codeInfo);
  const code = codeEl.value.trim();
  if (!/^\d{6}$/.test(code)) {
    show(codeErr, 'Please enter the 6-digit code from your email.');
    return;
  }
  codeBtn.disabled = true;
  const original = codeBtn.textContent;
  codeBtn.textContent = 'Verifying\u2026';
  try {
    const res = await fetch('/api/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentEmail, code })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      show(codeErr, errMsg(data, 'Could not verify code. Please try again.'));
      codeBtn.disabled = false; codeBtn.textContent = original;
      return;
    }

    try {
      const KEY = 'vs_pending_claims';
      const raw = localStorage.getItem(KEY);
      const list = raw ? JSON.parse(raw) : [];
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const fresh = Array.isArray(list)
        ? list.filter(e => e && typeof e.id === 'string' && typeof e.ts === 'number' && e.ts >= cutoff)
        : [];
      const videoIds = fresh.map(e => e.id);
      if (videoIds.length) {
        await fetch('/api/my-videos/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoIds })
        }).catch(() => {});
      }
      localStorage.removeItem(KEY);
    } catch {}

    const params = new URLSearchParams(window.location.search);
    window.location.href = params.get('next') || '/account';
  } catch {
    show(codeErr, 'Network error. Please try again.');
    codeBtn.disabled = false; codeBtn.textContent = original;
  }
});

resendBtn.addEventListener('click', async () => {
  if (!currentEmail) return;
  hide(codeErr); hide(codeInfo);
  resendBtn.disabled = true;
  const original = resendBtn.textContent;
  resendBtn.textContent = 'Sending\u2026';
  const { ok, data } = await requestCode(currentEmail).catch(() => ({ ok: false, data: {} }));
  resendBtn.textContent = original;
  if (!ok) {
    show(codeErr, errMsg(data, 'Could not resend code.'));
    setTimeout(() => { resendBtn.disabled = false; }, 2000);
    return;
  }
  show(codeInfo, 'A new code is on its way.');
  setTimeout(() => { resendBtn.disabled = false; }, 15000);
});

changeBtn.addEventListener('click', () => {
  currentEmail = '';
  goToStep('email');
});

{
  const params = new URLSearchParams(window.location.search);
  if (params.get('reason') === 'expired') {
    document.getElementById('sessionNotice').classList.add('visible');
  }
}

fetch('/api/auth/me').then(r => {
  if (!r.ok) return;
  const params = new URLSearchParams(window.location.search);
  window.location.replace(params.get('next') || '/account');
});
