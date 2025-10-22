export function showLoginOverlay(onSuccess) {
  if (window.__loginOverlay) window.__loginOverlay.remove();
  // Hide map containers
  const map = document.getElementById('map');
  const split = document.getElementById('split-maps-container');
  if (map) map.style.display = 'none';
  if (split) split.style.display = 'none';

  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'linear-gradient(180deg, #0f172a 0%, #0b1020 100%)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.color = '#e2e8f0';
  overlay.style.zIndex = 3000;

  const box = document.createElement('div');
  box.style.background = '#111827';
  box.style.border = '1px solid #1f2937';
  box.style.borderRadius = '12px';
  box.style.boxShadow = '0 20px 60px rgba(0,0,0,0.4)';
  box.style.padding = '28px 26px 22px 26px';
  box.style.width = '340px';

  const title = document.createElement('div');
  title.textContent = 'MML Map — Sign in';
  title.style.fontSize = '18px';
  title.style.fontWeight = '600';
  title.style.marginBottom = '14px';
  title.style.textAlign = 'center';
  box.appendChild(title);

  const form = document.createElement('form');
  form.autocomplete = 'off';

  const u = document.createElement('input');
  u.type = 'text'; u.placeholder = 'Username';
  u.style.width = '100%'; u.style.padding = '10px 12px'; u.style.marginBottom = '10px';
  u.style.borderRadius = '8px'; u.style.border = '1px solid #374151'; u.style.background = '#0b1220'; u.style.color = '#e5e7eb';

  const p = document.createElement('input');
  p.type = 'password'; p.placeholder = 'Password';
  p.style.width = '100%'; p.style.padding = '10px 12px'; p.style.marginBottom = '12px';
  p.style.borderRadius = '8px'; p.style.border = '1px solid #374151'; p.style.background = '#0b1220'; p.style.color = '#e5e7eb';

  const err = document.createElement('div');
  err.style.color = '#f87171'; err.style.minHeight = '18px'; err.style.fontSize = '12px'; err.style.marginBottom = '8px';

  const submit = document.createElement('button');
  submit.type = 'submit'; submit.textContent = 'Sign in';
  submit.style.width = '100%'; submit.style.padding = '10px 12px';
  submit.style.borderRadius = '8px'; submit.style.border = '1px solid #2563eb';
  submit.style.background = '#2563eb'; submit.style.color = 'white'; submit.style.cursor = 'pointer';

  form.appendChild(u); form.appendChild(p); form.appendChild(err); form.appendChild(submit);
  box.appendChild(form);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  window.__loginOverlay = overlay;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const { login } = await import('../auth/session.js');
    const res = await login(u.value.trim(), p.value);
    if (!res || !res.ok) { err.textContent = 'Invalid credentials'; return; }
    overlay.remove();
    if (map) map.style.display = 'block';
    onSuccess && onSuccess(res.user);
  };
}
