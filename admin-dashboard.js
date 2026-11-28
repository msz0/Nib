(() => {
  'use strict';

  const config = window.NIB_ADMIN_CONFIG || {};
  const baseUrl = String(config.supabaseUrl || '').replace(/\/+$/, '');
  const anonKey = String(config.anonKey || '').trim();
  const $ = id => document.getElementById(id);
  const state = { session: null, user: null, role: '', installations: [], actions: [], diagnostics: [], members: [] };
  const sessionKey = 'nib-admin-session:' + (baseUrl || 'unconfigured');
  const FEATURE_FLAGS = ['calendar.google', 'screen.ocr', 'voice.memo', 'ai.chat'];
  const REPAIR_ACTIONS = ['retry_calendar_sync', 'refresh_app_state'];

  function setMessage(element, text, kind) {
    element.textContent = text || '';
    element.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  function setConnection(text, connected) {
    const element = $('connection-state');
    element.textContent = text;
    element.classList.toggle('connected', !!connected);
    const dot = document.createElement('i');
    element.prepend(dot);
  }

  function showSetupError(message) {
    const notice = $('setup-notice');
    notice.hidden = false;
    notice.textContent = message;
    setConnection('Setup required', false);
    $('login-panel').hidden = true;
  }

  function saveSession(session) {
    state.session = session;
    sessionStorage.setItem(sessionKey, JSON.stringify(session));
  }

  function clearSession() {
    state.session = null;
    state.user = null;
    state.role = '';
    sessionStorage.removeItem(sessionKey);
  }

  async function rawAuth(path, body) {
    const response = await fetch(baseUrl + '/auth/v1/' + path, {
      method: 'POST',
      headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.msg || result.message || result.error_description || result.error || 'Authentication request failed.');
    return result;
  }

  async function restoreSession() {
    const raw = sessionStorage.getItem(sessionKey);
    if (!raw) return false;
    try {
      state.session = JSON.parse(raw);
      if (!state.session.refresh_token) throw new Error('Session is incomplete.');
      if (Number(state.session.expires_at || 0) <= Math.floor(Date.now() / 1000) + 60) {
        const renewed = await rawAuth('token?grant_type=refresh_token', { refresh_token: state.session.refresh_token });
        const lifetime = Number(renewed.expires_in) || 3600;
        saveSession({ ...renewed, expires_at: Math.floor(Date.now() / 1000) + lifetime });
      }
      return true;
    } catch {
      clearSession();
      return false;
    }
  }

  async function consumeMagicLink() {
    const query = new URLSearchParams(location.search);
    const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (query.has('token_hash')) {
      const session = await rawAuth('verify', {
        token_hash: query.get('token_hash'),
        type: query.get('type') || 'magiclink'
      });
      saveSession({ ...session, expires_at: Math.floor(Date.now() / 1000) + (Number(session.expires_in) || 3600) });
      history.replaceState(null, '', location.pathname);
      return true;
    }
    if (fragment.has('access_token') && fragment.has('refresh_token')) {
      const session = {
        access_token: fragment.get('access_token'),
        refresh_token: fragment.get('refresh_token'),
        expires_at: Math.floor(Date.now() / 1000) + (Number(fragment.get('expires_in')) || 3600),
        token_type: fragment.get('token_type') || 'bearer'
      };
      saveSession(session);
      history.replaceState(null, '', location.pathname);
      return true;
    }
    return false;
  }

  async function api(path, options = {}) {
    if (!state.session || !state.session.access_token) throw new Error('Your team session expired. Sign in again.');
    const response = await fetch(baseUrl + '/rest/v1/' + path, {
      method: options.method || 'GET',
      headers: {
        apikey: anonKey,
        Authorization: 'Bearer ' + state.session.access_token,
        ...(options.body ? { 'content-type': 'application/json', Prefer: options.prefer || 'return=representation' } : {}),
        ...(options.headers || {})
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });
    const result = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = result.message || result.error_description || result.error || 'Supabase request failed (HTTP ' + response.status + ').';
      if (response.status === 401) {
        clearSession();
        showLogin('Your team session expired. Please sign in again.');
      }
      throw new Error(message);
    }
    return result;
  }

  async function getUser() {
    const response = await fetch(baseUrl + '/auth/v1/user', {
      headers: { apikey: anonKey, Authorization: 'Bearer ' + state.session.access_token }
    });
    const user = await response.json().catch(() => ({}));
    if (!response.ok || !user.id) throw new Error('Could not verify the signed-in account.');
    state.user = user;
  }

  function showLogin(message) {
    $('dashboard').hidden = true;
    $('login-panel').hidden = false;
    $('signout-button').hidden = true;
    setConnection('Signed out', false);
    if (message) setMessage($('login-message'), message);
  }

  function makeCell(row, value, className) {
    const cell = document.createElement('td');
    if (className) cell.className = className;
    cell.textContent = value == null || value === '' ? '—' : String(value);
    row.appendChild(cell);
    return cell;
  }

  function formatDate(value) {
    if (!value) return 'Never';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }

  function emptyRow(tbody, columns, message) {
    tbody.replaceChildren();
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'empty-row';
    cell.colSpan = columns;
    cell.textContent = message;
    row.appendChild(cell);
    tbody.appendChild(row);
  }

  function renderInstallations() {
    const tbody = $('installations-body');
    const query = $('installation-search').value.trim().toLowerCase();
    const rows = state.installations.filter(item =>
      [item.user_id, item.installation_id, item.app_version, item.platform].some(value => String(value || '').toLowerCase().includes(query)));
    if (!rows.length) {
      emptyRow(tbody, 7, state.installations.length ? 'No installations match that search.' : 'No opted-in installations registered yet. Nib account enrollment is a separate client update.');
      $('installation-count').textContent = '0 installations shown';
      return;
    }
    tbody.replaceChildren();
    for (const item of rows) {
      const row = document.createElement('tr');
      makeCell(row, item.user_id, 'mono');
      makeCell(row, item.installation_id, 'mono');
      makeCell(row, item.app_version);
      makeCell(row, item.platform);
      makeCell(row, formatDate(item.last_seen_at));
      const consent = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = 'pill' + (item.telemetry_consent ? ' good' : '');
      pill.textContent = item.telemetry_consent ? 'Opted in' : 'No telemetry';
      consent.appendChild(pill);
      row.appendChild(consent);
      const action = document.createElement('td');
      const button = document.createElement('button');
      button.className = 'row-action';
      button.type = 'button';
      button.textContent = 'Queue action';
      button.addEventListener('click', () => openAction(item.installation_id));
      action.appendChild(button);
      row.appendChild(action);
      tbody.appendChild(row);
    }
    $('installation-count').textContent = rows.length + ' of ' + state.installations.length + ' installations';
  }

  function renderActions() {
    const tbody = $('actions-body');
    if (!state.actions.length) return emptyRow(tbody, 5, 'No actions have been queued.');
    tbody.replaceChildren();
    for (const action of state.actions) {
      const row = document.createElement('tr');
      makeCell(row, actionLabel(action.action_type, action.payload));
      makeCell(row, action.target_installation_id, 'mono');
      makeCell(row, action.created_by, 'mono');
      const cell = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = 'pill' + (action.status === 'completed' ? ' good' : '');
      pill.textContent = action.status;
      cell.appendChild(pill);
      row.appendChild(cell);
      makeCell(row, formatDate(action.created_at));
      tbody.appendChild(row);
    }
  }

  function actionLabel(type, payload) {
    if (type === 'require_update') return 'Require update to ' + (payload.minimum_version || 'release');
    if (type === 'feature_flag') return (payload.enabled ? 'Enable ' : 'Disable ') + payload.key;
    if (type === 'repair_action') return 'Repair: ' + payload.repair;
    if (type === 'diagnostics_request') return 'Request approved diagnostics';
    return 'Unknown action';
  }

  function renderTeam() {
    const tbody = $('team-body');
    if (!state.members.length) return emptyRow(tbody, 4, 'No team members found.');
    tbody.replaceChildren();
    for (const member of state.members) {
      const row = document.createElement('tr');
      makeCell(row, member.user_id, 'mono');
      const role = document.createElement('td');
      role.className = member.role === 'admin' ? 'role-admin' : 'role-developer';
      role.textContent = member.role;
      row.appendChild(role);
      makeCell(row, formatDate(member.created_at));
      const cell = document.createElement('td');
      if (state.role === 'admin' && member.user_id !== state.user.id) {
        const button = document.createElement('button');
        button.className = 'row-action';
        button.type = 'button';
        button.textContent = 'Remove';
        button.addEventListener('click', () => removeMember(member.user_id));
        cell.appendChild(button);
      }
      row.appendChild(cell);
      tbody.appendChild(row);
    }
  }

  function renderDiagnostics() {
    const tbody = $('diagnostics-body');
    if (!state.diagnostics.length) return emptyRow(tbody, 5, 'No consented diagnostics received.');
    tbody.replaceChildren();
    for (const item of state.diagnostics) {
      const row = document.createElement('tr');
      makeCell(row, item.installation_id, 'mono');
      makeCell(row, item.app_version);
      makeCell(row, item.component);
      makeCell(row, item.error_code, 'mono');
      makeCell(row, formatDate(item.created_at));
      tbody.appendChild(row);
    }
  }

  async function loadDashboard() {
    setConnection('Loading secure data', true);
    const memberships = await api('nib_team_members?select=user_id,role,created_at&user_id=eq.' + encodeURIComponent(state.user.id) + '&limit=1');
    if (!Array.isArray(memberships) || !memberships.length || !['admin', 'developer'].includes(memberships[0].role)) {
      clearSession();
      showLogin('This account is not on the Nib admin/developer team.');
      return;
    }
    state.role = memberships[0].role;
    const [installations, actions, diagnostics, members] = await Promise.all([
      api('nib_installations?select=installation_id,user_id,app_version,platform,created_at,last_seen_at,telemetry_consent&order=last_seen_at.desc.nullslast&limit=1000'),
      api('nib_admin_actions?select=id,target_installation_id,action_type,payload,status,created_by,created_at&order=created_at.desc&limit=100'),
      api('nib_diagnostics?select=id,installation_id,app_version,component,error_code,created_at&order=created_at.desc&limit=100'),
      api('nib_team_members?select=user_id,role,created_at&order=created_at.asc&limit=100')
    ]);
    state.installations = Array.isArray(installations) ? installations : [];
    state.actions = Array.isArray(actions) ? actions : [];
    state.diagnostics = Array.isArray(diagnostics) ? diagnostics : [];
    state.members = Array.isArray(members) ? members : [];
    $('login-panel').hidden = true;
    $('dashboard').hidden = false;
    $('signout-button').hidden = false;
    $('user-badge').textContent = state.user.email || state.user.id;
    $('team-admin-tools').hidden = state.role !== 'admin';
    $('metric-installations').textContent = String(state.installations.length);
    $('metric-active').textContent = String(state.installations.filter(item => item.last_seen_at && Date.now() - new Date(item.last_seen_at).getTime() < 7 * 864e5).length);
    $('metric-queued').textContent = String(state.actions.filter(item => item.status === 'queued').length);
    $('metric-team').textContent = String(state.members.length);
    renderInstallations();
    renderActions();
    renderDiagnostics();
    renderTeam();
    setConnection('Authenticated · ' + state.role, true);
  }

  function openAction(installationId) {
    const target = $('action-target');
    target.replaceChildren();
    for (const item of state.installations) {
      const option = document.createElement('option');
      option.value = item.installation_id;
      option.textContent = item.installation_id + ' · ' + (item.app_version || 'unknown version');
      target.appendChild(option);
    }
    target.value = installationId;
    $('action-message').textContent = '';
    renderActionFields();
    $('action-dialog').showModal();
  }

  function renderActionFields() {
    const fields = $('action-fields');
    fields.replaceChildren();
    const type = $('action-type').value;
    if (type === 'require_update') {
      addField(fields, 'Minimum version', 'action-version', 'text', '0.5.0', 'Use a signed Nib release version such as 0.5.0.');
    } else if (type === 'feature_flag') {
      const keyLabel = document.createElement('label');
      keyLabel.htmlFor = 'action-flag';
      keyLabel.textContent = 'Approved flag';
      const key = document.createElement('select');
      key.id = 'action-flag';
      for (const value of FEATURE_FLAGS) addOption(key, value, value);
      const enabledLabel = document.createElement('label');
      enabledLabel.htmlFor = 'action-enabled';
      enabledLabel.textContent = 'State';
      const enabled = document.createElement('select');
      enabled.id = 'action-enabled';
      addOption(enabled, 'true', 'Enabled');
      addOption(enabled, 'false', 'Disabled');
      fields.append(keyLabel, key, enabledLabel, enabled);
    } else if (type === 'repair_action') {
      const label = document.createElement('label');
      label.htmlFor = 'action-repair';
      label.textContent = 'Approved repair';
      const select = document.createElement('select');
      select.id = 'action-repair';
      addOption(select, 'retry_calendar_sync', 'Retry calendar sync');
      addOption(select, 'refresh_app_state', 'Refresh app state');
      fields.append(label, select);
    } else {
      const note = document.createElement('p');
      note.className = 'hint';
      note.textContent = 'The user must approve a diagnostic request on their device. Only limited error codes and version information are intended—never notes, clipboard, calendar contents, recordings, or keys.';
      fields.appendChild(note);
    }
  }

  function addOption(select, value, label) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  function addField(parent, labelText, id, type, placeholder, hint) {
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = labelText;
    const input = document.createElement('input');
    input.id = id;
    input.type = type;
    input.placeholder = placeholder;
    input.required = true;
    const description = document.createElement('p');
    description.className = 'hint';
    description.textContent = hint;
    parent.append(label, input, description);
  }

  function buildPayload() {
    const type = $('action-type').value;
    if (type === 'require_update') {
      const version = $('action-version').value.trim();
      if (!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version)) throw new Error('Enter a version such as 0.5.0.');
      return { type, payload: { minimum_version: version } };
    }
    if (type === 'feature_flag') return { type, payload: { key: $('action-flag').value, enabled: $('action-enabled').value === 'true' } };
    if (type === 'repair_action') return { type, payload: { repair: $('action-repair').value } };
    return { type: 'diagnostics_request', payload: {} };
  }

  async function queueAction(event) {
    event.preventDefault();
    const button = $('queue-action');
    button.disabled = true;
    setMessage($('action-message'), 'Saving auditable request…');
    try {
      const action = buildPayload();
      await api('nib_admin_actions', {
        method: 'POST',
        body: {
          target_installation_id: $('action-target').value,
          action_type: action.type,
          payload: action.payload,
          status: 'queued',
          created_by: state.user.id
        }
      });
      $('action-dialog').close();
      await loadDashboard();
      document.querySelector('[data-page="actions"]').click();
    } catch (error) {
      setMessage($('action-message'), error.message || 'Could not queue that action.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function addMember(event) {
    event.preventDefault();
    const userId = $('team-user-id').value.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      return window.alert('Enter a valid Supabase user UUID.');
    }
    try {
      await api('nib_team_members', { method: 'POST', body: { user_id: userId, role: $('team-role').value } });
      $('team-user-id').value = '';
      await loadDashboard();
    } catch (error) {
      window.alert(error.message || 'Could not grant team access.');
    }
  }

  async function removeMember(userId) {
    if (!window.confirm('Remove this account from the Nib team?')) return;
    try {
      await api('nib_team_members?user_id=eq.' + encodeURIComponent(userId), { method: 'DELETE', prefer: 'return=minimal' });
      await loadDashboard();
    } catch (error) {
      window.alert(error.message || 'Could not remove team access.');
    }
  }

  function selectPage(name) {
    document.querySelectorAll('.nav-link').forEach(link => link.classList.toggle('active', link.dataset.page === name));
    const section = document.querySelector('[data-section="' + name + '"]');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function start() {
    if (!baseUrl || !anonKey || !/^https:\/\//i.test(baseUrl)) {
      return showSetupError('Admin dashboard is not configured. Set the Supabase project URL and public anon key in admin-config.js. Never put a service_role key in this file.');
    }
    try {
      await consumeMagicLink();
      if (!(await restoreSession())) {
        showLogin();
        return;
      }
      await getUser();
      await loadDashboard();
    } catch (error) {
      clearSession();
      showLogin(error.message || 'Could not verify your team account.');
    }
  }

  $('login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('login-button');
    const email = $('login-email').value.trim();
    button.disabled = true;
    setMessage($('login-message'), 'Sending a secure sign-in link…');
    try {
      const redirect = encodeURIComponent(location.origin + location.pathname);
      await rawAuth('otp?redirect_to=' + redirect, { email, create_user: false });
      setMessage($('login-message'), 'If this address belongs to an invited team account, a sign-in link is on its way.', 'success');
    } catch (error) {
      setMessage($('login-message'), error.message || 'Could not send the sign-in link.', 'error');
    } finally {
      button.disabled = false;
    }
  });
  $('signout-button').addEventListener('click', async () => {
    try { if (state.session) await fetch(baseUrl + '/auth/v1/logout', { method: 'POST', headers: { apikey: anonKey, Authorization: 'Bearer ' + state.session.access_token } }); } catch {}
    clearSession();
    showLogin('You have signed out.');
  });
  $('refresh-button').addEventListener('click', async () => {
    if (!state.session) return;
    try {
      await restoreSession();
      await getUser();
      await loadDashboard();
    } catch (error) {
      setConnection('Refresh failed', false);
      window.alert(error.message || 'Could not refresh dashboard data.');
    }
  });
  $('installation-search').addEventListener('input', renderInstallations);
  $('action-type').addEventListener('change', renderActionFields);
  $('action-form').addEventListener('submit', queueAction);
  $('close-dialog').addEventListener('click', () => $('action-dialog').close());
  $('cancel-action').addEventListener('click', () => $('action-dialog').close());
  $('team-form').addEventListener('submit', addMember);
  document.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    selectPage(link.dataset.page);
    history.replaceState(null, '', '#' + link.dataset.page);
  }));
  setConnection('Checking setup', false);
  start();
})();
