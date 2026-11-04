// Official Spotify Web API sign-in (PKCE, no client secret). Gives exact playback position and track details,
// which makes the lyric sync accurate. Spotify's API has no lyrics endpoint; lyrics still come from LRCLIB.
const fs = require('fs'), crypto = require('crypto');
const AUTH = process.env.NIB_SPOTIFY_AUTH || 'https://accounts.spotify.com';
const API = process.env.NIB_SPOTIFY_API || 'https://api.spotify.com';
const REDIRECT = 'http://127.0.0.1:47821/spotify/callback';
const b64 = b => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const form = o => new URLSearchParams(o).toString();

function create({ file, enc, dec, open, clientId, onChange }) {
  let tok = null, verifier = '', state = '', last = 'Paused';
  const load = () => { try { tok = JSON.parse(dec(fs.readFileSync(file))); } catch { tok = null; } };
  const save = () => { try { if (tok) fs.writeFileSync(file, enc(JSON.stringify(tok))); else fs.rmSync(file, { force: true }); } catch {} };
  async function token(body) {
    const r = await fetch(AUTH + '/api/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.error || 'HTTP ' + r.status);
    return j;
  }
  const keep = j => { tok = { access: j.access_token, refresh: j.refresh_token || (tok && tok.refresh), exp: Date.now() + j.expires_in * 1000 - 30000 }; save(); };
  function connect() {
    const id = clientId(); if (!id) throw new Error('Enter your Spotify Client ID first');
    verifier = b64(crypto.randomBytes(48)); state = b64(crypto.randomBytes(12));
    open(AUTH + '/authorize?' + form({ client_id: id, response_type: 'code', redirect_uri: REDIRECT, code_challenge_method: 'S256',
      code_challenge: b64(crypto.createHash('sha256').update(verifier).digest()), scope: 'user-read-playback-state user-read-currently-playing user-modify-playback-state', state }));
  }
  async function callback(q) {
    if (q.get('error')) throw new Error('Spotify said: ' + q.get('error'));
    if (!q.get('code') || q.get('state') !== state) throw new Error('Sign-in did not match. Start again from Nib Settings.');
    keep(await token({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: REDIRECT, client_id: clientId(), code_verifier: verifier }));
    onChange(true);
  }
  async function access() {
    if (!tok) return null; if (Date.now() < tok.exp) return tok.access;
    try { keep(await token({ grant_type: 'refresh_token', refresh_token: tok.refresh, client_id: clientId() })); return tok.access; }
    catch { tok = null; save(); onChange(false); return null; }
  }
  async function playing() {   // same shape as the Windows media session, or null
    const a = await access(); if (!a) return null;
    const t0 = Date.now();
    const r = await fetch(API + '/v1/me/player/currently-playing', { headers: { Authorization: 'Bearer ' + a } }).catch(() => null);
    if (!r) return null; if (r.status === 401 && tok) { tok.exp = 0; return null; } if (!r.ok || r.status === 204) return null;
    const j = await r.json().catch(() => null), it = j && j.item; if (!it || j.currently_playing_type !== 'track') return null;
    const on = !!j.is_playing; last = on ? 'Playing' : 'Paused';
    const im = (it.album && it.album.images) || [], art = (im.find(x => x.width <= 320 && x.width >= 150) || im[0] || {}).url || '';
    return { title: it.name, artist: it.artists.map(x => x.name).join(', '), artist1: it.artists[0] ? it.artists[0].name : '', album: it.album ? it.album.name : '',
      status: on ? 'Playing' : 'Paused', pos: (j.progress_ms || 0) / 1000 + (on ? (Date.now() - t0) / 2000 : 0), dur: (it.duration_ms || 0) / 1000, src: 'Spotify', api: true, artUrl: art };
  }
  async function control(cmd) {   // fallback when the Windows session isn't available (Premium accounts only)
    const a = await access(); if (!a) return false;
    const [method, url] = cmd === 'play' ? ['PUT', last === 'Playing' ? '/v1/me/player/pause' : '/v1/me/player/play'] : ['POST', cmd === 'next' ? '/v1/me/player/next' : '/v1/me/player/previous'];
    const r = await fetch(API + url, { method, headers: { Authorization: 'Bearer ' + a, 'content-length': '0' } }).catch(() => null);
    return !!r && (r.ok || r.status === 204);
  }
  load();
  return { control, connect, callback, playing, connected: () => !!tok, disconnect: () => { tok = null; save(); onChange(false); }, REDIRECT };
}
module.exports = { create, REDIRECT };
