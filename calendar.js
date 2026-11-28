const ICAL = require('ical.js');

const WEEK = 7 * 864e5;
const MAX_ICS_BYTES = 20 * 1024 * 1024;
let calendarUrl = '';
let calendarComponent = null;
let snapshot = null;
let lastResult = null;
let lastSync = 0;
let lastError = '';
let etag = '';
let lastModified = '';
let syncing = null;
let configVersion = 0;

function normalizePublicUrl(value) {
  let url;
  try {
    const raw = String(value || '').trim().replace(/^webcal:/i, 'https:');
    url = new URL(raw);
  } catch {
    throw new Error('Paste a valid public Apple Calendar link.');
  }
  if (url.protocol !== 'https:' || url.username || url.password ||
    (url.port && url.port !== '443') ||
    !(url.hostname === 'icloud.com' || url.hostname.endsWith('.icloud.com'))) {
    throw new Error('Use the public iCloud calendar link copied from Apple Calendar.');
  }
  url.hash = '';
  return url.href;
}

async function fetchCalendar(url, previousEtag, previousModified) {
  let target = new URL(url);
  for (let redirects = 0; redirects < 6; redirects++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch(target.href, {
        method: 'GET',
        headers: {
          Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.1',
          ...(previousEtag ? { 'If-None-Match': previousEtag } : {}),
          ...(previousModified ? { 'If-Modified-Since': previousModified } : {})
        },
        redirect: 'manual',
        signal: controller.signal
      });
    } catch (error) {
      throw new Error(error && error.name === 'AbortError' ? 'Apple Calendar request timed out.' : 'Could not reach the public Apple Calendar link.');
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Apple Calendar returned an invalid redirect.');
      target = new URL(location, target);
      if (target.protocol !== 'https:' ||
        (target.port && target.port !== '443') ||
        !(target.hostname === 'icloud.com' || target.hostname.endsWith('.icloud.com'))) {
        throw new Error('Apple Calendar redirected outside iCloud; the link was not followed.');
      }
      continue;
    }
    if (response.status === 304) return { notModified: true };
    if (!response.ok) throw new Error('Apple Calendar returned HTTP ' + response.status + '. Check that the calendar is public.');

    const size = Number(response.headers.get('content-length'));
    if (Number.isFinite(size) && size > MAX_ICS_BYTES) throw new Error('The public calendar is too large to sync.');
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_ICS_BYTES) throw new Error('The public calendar is too large to sync.');
    return {
      notModified: false,
      text,
      etag: response.headers.get('etag') || '',
      lastModified: response.headers.get('last-modified') || ''
    };
  }
  throw new Error('Apple Calendar redirected too many times.');
}

function parseCalendar(text) {
  try {
    const component = new ICAL.Component(ICAL.parse(text));
    component.getAllSubcomponents('vtimezone').forEach(zone => {
      try { ICAL.TimezoneService.register(zone); } catch {}
    });
    return component;
  } catch {
    throw new Error('Apple Calendar returned an unreadable calendar. Check that the public link is correct.');
  }
}

function eventSnapshot(component) {
  const events = new Map();
  for (const vevent of component.getAllSubcomponents('vevent')) {
    const event = new ICAL.Event(vevent);
    if (!event.uid) continue;
    const recurrence = vevent.getFirstPropertyValue('recurrence-id');
    const recurrenceKey = recurrence ? recurrence.toString() : 'master';
    events.set(`${event.uid}\0${recurrenceKey}`, {
      title: event.summary || '(no title)',
      signature: JSON.stringify(vevent.toJSON())
    });
  }
  return events;
}

function eventsBetween(component, rangeStart, rangeEnd, max = 5000) {
  const out = [];
  for (const item of component.getAllSubcomponents('vevent')) {
    const event = new ICAL.Event(item);
    const add = (startDate, finishDate) => {
      if (!startDate || !finishDate) return;
      const begins = startDate.toJSDate().getTime();
      const ends = finishDate.toJSDate().getTime();
      if (ends > rangeStart && begins < rangeEnd) out.push({
        id: `${event.uid}-${begins}`,
        t: begins,
        end: ends,
        title: event.summary || '(no title)',
        allDay: startDate.isDate
      });
    };
    if (event.isRecurring()) {
      const iterator = event.iterator(ICAL.Time.fromJSDate(new Date(rangeStart)));
      let occurrence, count = 0;
      while ((occurrence = iterator.next()) && count++ < 4000) {
        const start = occurrence.toJSDate().getTime();
        if (start >= rangeEnd) break;
        const details = event.getOccurrenceDetails(occurrence);
        add(details.startDate, details.endDate);
      }
    } else {
      add(event.startDate, event.endDate);
    }
  }
  return out.sort((a, b) => a.t - b.t).slice(0, max);
}

function upcoming(component, now = Date.now(), max = 6) {
  return eventsBetween(component, now, now + WEEK, max);
}

function compareSnapshots(previous, next) {
  const changes = [];
  if (!previous) return changes;
  for (const [key, value] of next) {
    const old = previous.get(key);
    if (!old) changes.push({ type: 'added', title: value.title });
    else if (old.signature !== value.signature) changes.push({ type: 'changed', title: value.title });
  }
  return changes;
}

function configure(value) {
  const normalized = normalizePublicUrl(value);
  configVersion++;
  calendarUrl = normalized;
  calendarComponent = null;
  snapshot = null;
  lastResult = null;
  lastSync = 0;
  lastError = '';
  etag = '';
  lastModified = '';
  return calendarUrl;
}

function disconnect() {
  configVersion++;
  calendarUrl = '';
  calendarComponent = null;
  snapshot = null;
  lastResult = null;
  lastSync = 0;
  lastError = '';
  etag = '';
  lastModified = '';
}

async function sync() {
  if (!calendarUrl) throw new Error('Add your public Apple Calendar link in Settings first.');
  const version = configVersion;
  while (syncing) {
    if (syncing.version === version) return syncing.promise;
    try { await syncing.promise; } catch {}
    if (version !== configVersion) throw new Error('The Apple Calendar link changed during sync. Please try again.');
  }
  const url = calendarUrl;
  const operation = (async () => {
    try {
      const result = await fetchCalendar(url, etag, lastModified);
      if (version !== configVersion) throw new Error('The Apple Calendar link changed during sync. Please try again.');
      if (result.notModified) {
        if (!calendarComponent) throw new Error('Apple Calendar returned an empty not-modified response.');
        lastResult = upcoming(calendarComponent);
        lastSync = Date.now();
        lastError = '';
        return { events: lastResult, changes: [], syncedAt: lastSync };
      }
      const component = parseCalendar(result.text);
      const nextSnapshot = eventSnapshot(component);
      const changes = compareSnapshots(snapshot, nextSnapshot);
      calendarComponent = component;
      snapshot = nextSnapshot;
      lastResult = upcoming(component);
      lastSync = Date.now();
      lastError = '';
      etag = result.etag;
      lastModified = result.lastModified;
      return { events: lastResult, changes, syncedAt: lastSync };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Apple Calendar sync failed.';
      throw error;
    }
  })();
  const currentSync = { version, promise: operation };
  syncing = currentSync;
  try {
    return await operation;
  } finally {
    if (syncing === currentSync) syncing = null;
  }
}

async function getUpcoming() {
  if (!calendarUrl) return [];
  if (!lastResult || Date.now() - lastSync > 30000) return (await sync()).events;
  return lastResult;
}

async function getRange(start, end) {
  const from = Number(start), to = Number(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 62 * 864e5) {
    throw new Error('Choose a valid calendar date range.');
  }
  if (!calendarUrl) return [];
  if (!calendarComponent || Date.now() - lastSync > 30000) await sync();
  return eventsBetween(calendarComponent, from, to);
}

function status() {
  return {
    connected: !!calendarUrl,
    lastSync: lastSync ? new Date(lastSync).toISOString() : '',
    error: lastError
  };
}

module.exports = {
  configure,
  disconnect,
  sync,
  upcoming: getUpcoming,
  range: getRange,
  status,
  __test: { normalizePublicUrl, upcoming, eventsBetween, compareSnapshots }
};
