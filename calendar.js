// Reads a calendar's private ICS link (Google, Outlook, iCloud...) and lists upcoming events, recurring ones included.
const ICAL = require('ical.js');
let cache = { url: '', at: 0, data: [] };
async function upcoming(url, days = 7, max = 6) {
  if (cache.url === url && Date.now() - cache.at < 300000) return cache.data;
  const res = await fetch(url.replace(/^webcal:/i, 'https:'));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const comp = new ICAL.Component(ICAL.parse(await res.text()));
  comp.getAllSubcomponents('vtimezone').forEach(z => { try { ICAL.TimezoneService.register(z); } catch {} });
  const now = Date.now(), end = now + days * 864e5, out = [];
  for (const v of comp.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(v);
    const add = (s, e) => {
      const a = s.toJSDate().getTime(), b = (e || s).toJSDate().getTime();
      if (b >= now && a < end) out.push({ t: a, end: b, title: ev.summary || '(no title)', allDay: s.isDate });
    };
    if (ev.isRecurring()) {
      const it = ev.iterator(); let n, i = 0;
      while ((n = it.next()) && i++ < 4000) { const d = ev.getOccurrenceDetails(n); if (d.startDate.toJSDate().getTime() >= end) break; add(d.startDate, d.endDate); }
    } else add(ev.startDate, ev.endDate);
  }
  out.sort((a, b) => a.t - b.t);
  cache = { url, at: Date.now(), data: out.slice(0, max) };
  return cache.data;
}
module.exports = { upcoming, clear: () => cache = { url: '', at: 0, data: [] } };
