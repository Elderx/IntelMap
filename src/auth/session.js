export async function getSession() {
  try {
    const res = await fetch('/api/session', { credentials: 'same-origin' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function login(username, password) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    credentials: 'same-origin'
  });
  if (!res.ok) return null;
  return await res.json();
}

export async function logout() {
  try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); } catch {}
}

export async function listUsers() {
  try {
    const res = await fetch('/api/users', { credentials: 'same-origin' });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}
