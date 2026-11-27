// Reads a calendar's private ICS link (Google, Outlook, iCloud/Apple...) and lists upcoming events, recurring ones included.
const ICAL = require('ical.js');
let cache = { url: '', at: 0, data: [] };
async function upcoming(url, days = 7, max = 6, force = false) {
  if (!url || typeof url !== 'string' || !url.trim()) return [];
  const cleanUrl = url.trim().replace(/^webcals?:/i, 'https:');
  if (!force && cache.url === cleanUrl && Date.now() - cache.at < 25000) return cache.data;
  const fetchUrl = force ? (cleanUrl + (cleanUrl.includes('?') ? '&' : '?') + '_t=' + Date.now()) : cleanUrl;
  const res = await fetch(fetchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Nib/0.4.1',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const comp = new ICAL.Component(ICAL.parse(await res.text()));
  comp.getAllSubcomponents('vtimezone').forEach(z => { try { ICAL.TimezoneService.register(z); } catch {} });
  const now = Date.now(), end = now + days * 864e5, out = [];
  for (const v of comp.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(v);
    const uid = ev.uid || '';
    const add = (s, e, recKey = '') => {
      const a = s.toJSDate().getTime(), b = (e || s).toJSDate().getTime();
      if (b >= now && a < end) out.push({
        id: (uid || (ev.summary || 'ev')) + (recKey ? '_' + recKey : ''),
        t: a,
        end: b,
        title: ev.summary || '(no title)',
        allDay: s.isDate
      });
    };
    if (ev.isRecurring()) {
      const it = ev.iterator(); let n, i = 0;
      while ((n = it.next()) && i++ < 4000) {
        const d = ev.getOccurrenceDetails(n);
        if (d.startDate.toJSDate().getTime() >= end) break;
        add(d.startDate, d.endDate, String(d.startDate.toJSDate().getTime()));
      }
    } else add(ev.startDate, ev.endDate);
  }
  out.sort((a, b) => a.t - b.t);
  cache = { url: cleanUrl, at: Date.now(), data: out.slice(0, max) };
  return cache.data;
}
module.exports = { upcoming, clear: () => cache = { url: '', at: 0, data: [] } };
