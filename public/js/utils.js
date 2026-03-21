// ── Toast ────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const c = document.getElementById('toast');
  if (!c) return;
  const el = document.createElement('div');
  el.className = `ti ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  el.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
  c.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 4000);
}

// ── API helper ───────────────────────────────────────────
async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Server error');
  return data;
}

// ── Auth guard ───────────────────────────────────────────
async function requireAuth(expectedRole) {
  try {
    const { user } = await api('GET', '/api/auth/me');
    if (expectedRole && user.role !== expectedRole) {
      window.location.href = user.role === 'teacher' ? '/teacher' : '/student';
      return null;
    }
    return user;
  } catch {
    window.location.href = '/login';
    return null;
  }
}

// ── Logout ───────────────────────────────────────────────
async function logout() {
  await api('POST', '/api/auth/logout');
  window.location.href = '/login';
}

// ── Render user chip in topbar ───────────────────────────
function renderUserChip(user) {
  const el = document.getElementById('userChip');
  if (!el) return;
  const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  el.innerHTML = `
    <div class="user-av">${initials}</div>
    <span>${user.name}</span>
    <span style="color:var(--text3);font-size:.75rem;margin-left:4px">${user.role}</span>
  `;
}

// ── Subject icon ─────────────────────────────────────────
function subjectIcon(s = '') {
  if (s.includes('Data'))      return '🌳';
  if (s.includes('OS') || s.includes('Operating')) return '💻';
  if (s.includes('Network'))   return '🌐';
  if (s.includes('Database') || s.includes('DBMS')) return '🗄️';
  if (s.includes('Machine') || s.includes('ML'))  return '🤖';
  if (s.includes('Web'))       return '🕸️';
  if (s.includes('Software'))  return '⚙️';
  if (s.includes('Math'))      return '🔢';
  if (s.includes('Physics'))   return '⚛️';
  return '📖';
}

// ── Format date ──────────────────────────────────────────
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
