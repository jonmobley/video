fetch('/api/auth/me').then(r => {
  document.getElementById(r.ok ? 'navAccount' : 'navAuth').style.display = 'inline-block';
}).catch(() => { document.getElementById('navAuth').style.display = 'inline-block'; });
