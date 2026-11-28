const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_URL = 'https://www.googleapis.com/calendar/v3';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const b64url = value => Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function normalizeGoogleEvent(event) {
  if (!event || !event.id || !event.start || !event.end || event.status === 'cancelled') return null;
  const allDay = !!event.start.date;
  const start = allDay ? event.start.date : event.start.dateTime;
  const end = allDay ? event.end.date : event.end.dateTime;
  if (!start || !end) return null;
  return {
    id: String(event.id),
    googleId: String(event.id),
    source: 'google',
    title: String(event.summary || '(no title)').slice(0, 180),
    start,
    end,
    allDay,
    location: String(event.location || '').slice(0, 300),
    description: String(event.description || '').slice(0, 2000)
  };
}

function create({ file, encrypt, decrypt, openExternal, clientId }) {
  let refreshToken = '';
  let accessTokenValue = '';
  let accessExpiresAt = 0;
  let connecting = false;
  try {
    const saved = JSON.parse(decrypt(fs.readFileSync(file)));
    if (saved && typeof saved.refreshToken === 'string') refreshToken = saved.refreshToken;
  } catch (error) {
    if (fs.existsSync(file)) throw new Error('Could not read the encrypted Google Calendar connection: ' + error.message);
  }

  const currentClientId = () => String(typeof clientId === 'function' ? clientId() : clientId || '').trim();
  const persist = token => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = file + '.tmp';
    try {
      fs.writeFileSync(temp, encrypt(JSON.stringify({ refreshToken: token })));
      fs.renameSync(temp, file);
    } catch (error) {
      try { fs.rmSync(temp, { force: true }); } catch {}
      throw new Error('Could not securely save the Google Calendar connection: ' + error.message);
    }
  };
  const clearStored = () => {
    try { fs.rmSync(file, { force: true }); }
    catch (error) { throw new Error('Could not remove the saved Google Calendar connection: ' + error.message); }
    refreshToken = '';
    accessTokenValue = '';
    accessExpiresAt = 0;
  };
  const status = () => ({ connected: !!refreshToken, configured: !!currentClientId() });

  async function tokenRequest(params) {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(15000)
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error_description || data.error || 'Google sign-in failed (HTTP ' + response.status + ').');
    return data;
  }

  async function accessToken(force = false) {
    if (!force && accessTokenValue && Date.now() < accessExpiresAt - 30000) return accessTokenValue;
    if (!refreshToken) throw new Error('Connect a Google account in Nib Settings first.');
    const id = currentClientId();
    if (!id) throw new Error('Add a Google OAuth Client ID in Nib Settings first.');
    try {
      const data = await tokenRequest({ client_id: id, refresh_token: refreshToken, grant_type: 'refresh_token' });
      accessTokenValue = String(data.access_token || '');
      accessExpiresAt = Date.now() + Math.max(0, Number(data.expires_in) || 0) * 1000;
      if (!accessTokenValue) throw new Error('Google did not return an access token.');
      if (data.refresh_token && data.refresh_token !== refreshToken) {
        refreshToken = String(data.refresh_token);
        persist(refreshToken);
      }
      return accessTokenValue;
    } catch (error) {
      if (error.message && /invalid_grant/i.test(error.message)) clearStored();
      throw new Error(/invalid_grant/i.test(error.message || '')
        ? 'Google sign-in expired. Connect Google Calendar again in Settings.'
        : 'Could not refresh Google Calendar access: ' + error.message);
    }
  }

  async function api(url, options = {}, retried = false) {
    const token = await accessToken(retried);
    const response = await fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: 'Bearer ' + token }
    });
    if (response.status === 401 && !retried) {
      accessExpiresAt = 0;
      return api(url, options, true);
    }
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json()).error.message || ''; } catch {}
      const error = new Error(detail || 'Google Calendar request failed (HTTP ' + response.status + ').');
      error.status = response.status;
      throw error;
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async function connect() {
    if (connecting) throw new Error('Google sign-in is already in progress.');
    const id = currentClientId();
    if (!/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(id)) {
      throw new Error('Enter a valid Google OAuth Client ID in Settings before connecting.');
    }
    connecting = true;
    const verifier = b64url(crypto.randomBytes(48));
    const state = b64url(crypto.randomBytes(24));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    let server;
    try {
      await new Promise((resolve, reject) => {
        let settled = false;
        let timer;
        let redirect = '';
        const finish = (error, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (server && server.listening) server.close();
          error ? reject(error) : resolve(value);
        };
        server = http.createServer(async (req, res) => {
          const target = new URL(req.url, 'http://127.0.0.1');
          if (target.pathname !== '/oauth2callback') {
            res.writeHead(404); res.end('Not found'); return;
          }
          if (target.searchParams.get('state') !== state) {
            res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('Sign-in did not match. Return to Nib and try again.');
            finish(new Error('Google sign-in state did not match. Start again from Nib Settings.'));
            return;
          }
          const authError = target.searchParams.get('error');
          if (authError) {
            res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('Google sign-in was not completed. You can close this tab.');
            finish(new Error(authError === 'access_denied' ? 'Google sign-in was cancelled.' : 'Google sign-in failed: ' + authError));
            return;
          }
          const code = target.searchParams.get('code');
          if (!code) {
            res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('Google did not return an authorization code.');
            finish(new Error('Google did not return an authorization code.'));
            return;
          }
          try {
            const data = await tokenRequest({
              client_id: id,
              code,
              code_verifier: verifier,
              grant_type: 'authorization_code',
              redirect_uri: redirect
            });
            const nextRefresh = String(data.refresh_token || refreshToken);
            if (!nextRefresh) throw new Error('Google did not return a refresh token. Disconnect and try again with consent.');
            persist(nextRefresh);
            refreshToken = nextRefresh;
            accessTokenValue = String(data.access_token || '');
            accessExpiresAt = Date.now() + Math.max(0, Number(data.expires_in) || 0) * 1000;
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end('<!doctype html><meta charset="utf-8"><title>Nib Calendar</title><body style="font:16px Segoe UI,sans-serif;background:#111;color:#eee;display:grid;place-items:center;height:100vh"><p>Google Calendar connected to Nib. You can close this tab.</p></body>');
            finish(null, true);
          } catch (error) {
            res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('Nib could not finish connecting Google Calendar. Return to Nib for details.');
            finish(error);
          }
        });
        server.once('error', error => finish(new Error('Could not start the local Google sign-in callback: ' + error.message)));
        server.listen(0, '127.0.0.1', async () => {
          const address = server.address();
          if (!address || typeof address === 'string') {
            finish(new Error('Could not start the local Google sign-in callback.'));
            return;
          }
          redirect = 'http://127.0.0.1:' + address.port + '/oauth2callback';
          const auth = new URL(AUTH_URL);
          for (const [key, value] of Object.entries({
            client_id: id,
            redirect_uri: redirect,
            response_type: 'code',
            scope: SCOPE,
            access_type: 'offline',
            prompt: 'consent',
            code_challenge: challenge,
            code_challenge_method: 'S256',
            state
          })) auth.searchParams.set(key, value);
          timer = setTimeout(() => finish(new Error('Google sign-in timed out. Start again from Nib Settings.')), 180000);
          try { await openExternal(auth.href); }
          catch (error) { finish(new Error('Could not open the browser for Google sign-in: ' + error.message)); }
        });
      });
    } finally { connecting = false; }
  }

  async function listEvents(start, end) {
    if (!refreshToken) return [];
    const from = new Date(start), to = new Date(end);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from || to - from > 62 * 864e5) {
      throw new Error('Choose a valid calendar date range.');
    }
    const events = [];
    let pageToken = '';
    for (let page = 0; page < 5; page++) {
      const url = new URL(API_URL + '/calendars/primary/events');
      url.searchParams.set('timeMin', from.toISOString());
      url.searchParams.set('timeMax', to.toISOString());
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('orderBy', 'startTime');
      url.searchParams.set('maxResults', '2500');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const data = await api(url.href);
      for (const item of data.items || []) {
        const event = normalizeGoogleEvent(item);
        if (event) events.push(event);
      }
      pageToken = data.nextPageToken || '';
      if (!pageToken) return events;
    }
    if (pageToken) throw new Error('Google Calendar returned too many events for this view.');
    return events;
  }

  const eventBody = event => {
    const title = String(event.title || '').trim().slice(0, 180);
    if (!title) throw new Error('Add a title for this event.');
    const allDay = event.allDay === true;
    const start = String(event.start || '');
    const end = String(event.end || '');
    const startTime = Date.parse(allDay ? start + 'T00:00:00Z' : start);
    const endTime = Date.parse(allDay ? end + 'T00:00:00Z' : end);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
      throw new Error('Choose a valid end time after the start time.');
    }
    return {
      summary: title,
      start: allDay ? { date: start } : { dateTime: start },
      end: allDay ? { date: end } : { dateTime: end },
      ...(event.location ? { location: String(event.location).slice(0, 300) } : {}),
      ...(event.description ? { description: String(event.description).slice(0, 2000) } : {})
    };
  };
  async function createEvent(event) {
    const body = eventBody(event);
    if (event.id) body.id = crypto.createHash('sha256').update(String(event.id)).digest('hex');
    let data;
    try {
      data = await api(API_URL + '/calendars/primary/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (error) {
      if (error.status !== 409 || !body.id) throw error;
      data = await api(API_URL + '/calendars/primary/events/' + encodeURIComponent(body.id));
    }
    if (!data || !data.id) throw new Error('Google Calendar did not confirm the new event.');
    return String(data.id);
  }
  async function updateEvent(id, event) {
    if (!id || String(id).length > 300) throw new Error('Invalid Google Calendar event.');
    await api(API_URL + '/calendars/primary/events/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(eventBody(event))
    });
  }
  async function deleteEvent(id) {
    if (!id || String(id).length > 300) throw new Error('Invalid Google Calendar event.');
    await api(API_URL + '/calendars/primary/events/' + encodeURIComponent(id), { method: 'DELETE' });
  }

  return { connect, disconnect: clearStored, status, listEvents, createEvent, updateEvent, deleteEvent };
}

module.exports = { create, __test: { normalizeGoogleEvent } };
