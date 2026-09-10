/* Login gate — Supabase email + password, plus per-dashboard access control.
   Shows the login screen until a session exists, then checks the user's
   app_metadata.dashboards allowlist. If this dashboard is not in the list,
   shows an access-denied screen instead of booting. */
'use strict';

// Which dashboard this copy is. Must match the entry in app_metadata.dashboards.
const DASHBOARD_ID = 'purchasing';

let SB = null;

document.addEventListener('DOMContentLoaded', () => {
  // SUPABASE_URL / SUPABASE_ANON_KEY are top-level consts in auth-config.js —
  // global lexical bindings, visible here but NOT attached to window.
  if (!window.supabase || typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined') {
    // Missing dependency — fail visible instead of silently showing a dead login.
    console.error('supabase-js or auth-config.js missing');
    return;
  }
  SB = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const screen = document.getElementById('auth-screen');
  const form = document.getElementById('auth-form');
  const emailEl = document.getElementById('auth-email');
  const passEl = document.getElementById('auth-password');
  const errEl = document.getElementById('auth-error');
  const btn = document.getElementById('auth-submit');
  const deniedEl = document.getElementById('auth-denied');
  const deniedEmail = document.getElementById('auth-denied-email');
  const deniedBack = document.getElementById('auth-denied-back');

  function hasAccess(user) {
    const dashboards = (user && user.app_metadata && user.app_metadata.dashboards) || [];
    return Array.isArray(dashboards) && dashboards.includes(DASHBOARD_ID);
  }

  function showDenied(user) {
    screen.classList.remove('hidden');
    if (form) form.classList.add('hidden');
    if (deniedEl) deniedEl.classList.remove('hidden');
    if (deniedEmail) deniedEmail.textContent = user && user.email ? user.email : '';
    if (deniedBack) deniedBack.onclick = async () => { await SB.auth.signOut(); location.reload(); };
  }

  function enter(user) {
    if (!hasAccess(user)) return showDenied(user);
    fillUserInfo(user);
    screen.classList.add('hidden');
    // Only now is the dashboard allowed to load data and render.
    document.dispatchEvent(new CustomEvent('auth:ready', { detail: { user } }));
  }

  function showLogin() {
    screen.classList.remove('hidden');
    if (form) form.classList.remove('hidden');
    if (deniedEl) deniedEl.classList.add('hidden');
    if (emailEl) emailEl.focus();
  }

  // Restore an existing session (persisted in localStorage by supabase-js).
  SB.auth.getSession().then(({ data: { session } }) => {
    if (session) return enter(session.user);
    showLogin();
  }).catch(() => showLogin());

  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      errEl.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Signing in…';
      const email = (emailEl.value || '').trim();
      const password = passEl.value || '';
      const { data, error } = await SB.auth.signInWithPassword({ email, password });
      btn.disabled = false;
      btn.textContent = 'Sign in';
      if (error) {
        errEl.textContent = error.message;
        return;
      }
      enter(data.session ? data.session.user : null);
    });
  }

  const lo = document.getElementById('logout');
  if (lo) {
    lo.onclick = async () => {
      await SB.auth.signOut();
      location.reload();
    };
  }

  /* ---------- user menu dropdown ---------- */
  const userMenu = document.getElementById('user-menu');
  const userBtn = document.getElementById('user-btn');
  const userDropdown = document.querySelector('.user-dropdown');
  const userNameEl = document.getElementById('user-name');
  const userEmailEl = document.getElementById('user-email');

  function fillUserInfo(user) {
    if (userNameEl) {
      const fullName = (user && (user.user_metadata && user.user_metadata.full_name)) || '';
      userNameEl.textContent = fullName || (user && user.email ? user.email.split('@')[0] : 'Account');
    }
    if (userEmailEl) userEmailEl.textContent = user && user.email ? user.email : '';
  }

  if (userBtn && userDropdown) {
    userBtn.onclick = e => {
      e.stopPropagation();
      userDropdown.classList.toggle('hidden');
    };
    // Close on outside click / Escape
    document.addEventListener('click', e => {
      if (userMenu && !userMenu.contains(e.target)) userDropdown.classList.add('hidden');
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') userDropdown.classList.add('hidden');
    });
  }

  /* ---------- change password ---------- */
  const pwModal = document.getElementById('pw-modal');
  const pwForm = document.getElementById('pw-form');
  const pwCurrent = document.getElementById('pw-current');
  const pwNew = document.getElementById('pw-new');
  const pwConfirm = document.getElementById('pw-confirm');
  const pwMsg = document.getElementById('pw-msg');
  const pwSubmit = document.getElementById('pw-submit');
  const pwCancel = document.getElementById('pw-cancel');
  const changeBtn = document.getElementById('change-password');

  function openPwModal() {
    pwMsg.textContent = '';
    pwCurrent.value = pwNew.value = pwConfirm.value = '';
    pwModal.classList.remove('hidden');
    pwCurrent.focus();
  }
  function closePwModal() { pwModal.classList.add('hidden'); }

  if (changeBtn && pwForm) {
    changeBtn.onclick = openPwModal;
    pwCancel.onclick = closePwModal;
    pwModal.addEventListener('click', e => { if (e.target === pwModal) closePwModal(); });

    pwForm.addEventListener('submit', async e => {
      e.preventDefault();
      pwMsg.textContent = '';
      const current = pwCurrent.value || '';
      const next = pwNew.value || '';
      const confirm = pwConfirm.value || '';

      if (next.length < 8) { pwMsg.textContent = 'New password must be at least 8 characters.'; return; }
      if (next !== confirm) { pwMsg.textContent = 'New passwords do not match.'; return; }

      pwSubmit.disabled = true;
      pwSubmit.textContent = 'Updating…';

      // Verify current password, then update to the new one.
      const { data: { user: u } } = await SB.auth.getUser();
      const email = u && u.email ? u.email : '';
      const { error: signInErr } = await SB.auth.signInWithPassword({ email, password: current });
      if (signInErr) {
        pwMsg.textContent = 'Current password is incorrect.';
        pwSubmit.disabled = false;
        pwSubmit.textContent = 'Update password';
        return;
      }

      const { error: updateErr } = await SB.auth.updateUser({ password: next });
      pwSubmit.disabled = false;
      pwSubmit.textContent = 'Update password';
      if (updateErr) {
        pwMsg.textContent = updateErr.message;
        return;
      }

      pwMsg.style.color = 'var(--good)';
      pwMsg.textContent = 'Password updated.';
      setTimeout(closePwModal, 1200);
    });
  }
});
