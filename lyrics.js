// Synced lyrics from LRCLIB (free, community-run). Only title, artist, album and length are sent.
const cache = new Map(), busy = new Set();
const H = { 'User-Agent': 'Nib-island/0.5 (desktop widget)' };
const BASE = process.env.NIB_LRCLIB || 'https://lrclib.net';
const parse = t => t.split('\n').map(l => { const m = l.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/); return m ? { t: +m[1] * 60 + +m[2], x: m[3].trim() } : null; }).filter(Boolean);
const clean = t => t.replace(/\s*[\(\[][^)\]]*[\)\]]/g, '').replace(/\s+-\s+.*$/, '').trim() || t;
const get = async path => { try { const r = await fetch(BASE + path, { headers: H }); return r.ok ? await r.json() : null; } catch { return null; } };
async function load({ title, artist, album, dur }) {
  const q = { track_name: title, artist_name: artist }; if (album) q.album_name = album; if (dur) q.duration = String(Math.round(dur));
  let j = await get('/api/get?' + new URLSearchParams(q));
  if (!j || !j.syncedLyrics) { delete q.album_name; j = await get('/api/get?' + new URLSearchParams(q)); }
  if (!j || !j.syncedLyrics) {
    const list = (await get('/api/search?' + new URLSearchParams({ track_name: clean(title), artist_name: artist }))) || [];
    const ok = list.filter(x => x.syncedLyrics);
    j = (dur && ok.find(x => Math.abs((x.duration || 0) - dur) <= 3)) || ok[0] || null;
  }
  return j && j.syncedLyrics ? parse(j.syncedLyrics) : null;
}
module.exports = {
  parse, clean,
  peek: k => cache.get(k),                       // undefined = not fetched yet, null = none found, array = lyrics
  fetchFor(k, info) {
    if (cache.has(k) || busy.has(k)) return;
    busy.add(k); load(info).then(l => cache.set(k, l)).catch(() => cache.set(k, null)).finally(() => busy.delete(k));
  }
};
