const test = require('node:test');
const assert = require('node:assert/strict');
const ICAL = require('ical.js');
const calendar = require('../calendar');
const { __test } = calendar;

const icalTime = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

test('public calendar URLs accept iCloud webcal links and reject non-Apple hosts', () => {
  assert.equal(
    __test.normalizePublicUrl('webcal://p01-caldav.icloud.com/published/2/example'),
    'https://p01-caldav.icloud.com/published/2/example'
  );
  assert.throws(() => __test.normalizePublicUrl('https://calendar.example.com/public.ics'), /public iCloud calendar link/i);
  assert.throws(() => __test.normalizePublicUrl('http://p01-caldav.icloud.com/published/2/example'), /public iCloud calendar link/i);
});

test('upcoming Apple Calendar events are sorted and limited to the next week', () => {
  const now = Date.now();
  const start = new Date(now + 60 * 60 * 1000);
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:later
DTSTART:${icalTime(new Date(now + 2 * 864e5))}
DTEND:${icalTime(new Date(now + 2 * 864e5 + 30 * 60 * 1000))}
SUMMARY:Later event
END:VEVENT
BEGIN:VEVENT
UID:soon
DTSTART:${icalTime(start)}
DTEND:${icalTime(new Date(start.getTime() + 30 * 60 * 1000))}
SUMMARY:Soon event
END:VEVENT
BEGIN:VEVENT
UID:old
DTSTART:${icalTime(new Date(now - 2 * 864e5))}
DTEND:${icalTime(new Date(now - 2 * 864e5 + 30 * 60 * 1000))}
SUMMARY:Past event
END:VEVENT
BEGIN:VEVENT
UID:distant
DTSTART:${icalTime(new Date(now + 9 * 864e5))}
DTEND:${icalTime(new Date(now + 9 * 864e5 + 30 * 60 * 1000))}
SUMMARY:Distant event
END:VEVENT
END:VCALENDAR`;
  const parsed = new ICAL.Component(ICAL.parse(ics));
  assert.deepEqual(__test.upcoming(parsed, now).map(event => event.title), ['Soon event', 'Later event']);
});

test('calendar snapshots distinguish additions and edits without notifying deletions', () => {
  const before = new Map([
    ['same', { title: 'Planning', signature: 'old' }],
    ['removed', { title: 'Removed event', signature: 'unchanged' }]
  ]);
  const after = new Map([
    ['same', { title: 'Planning', signature: 'new' }],
    ['added', { title: 'New event', signature: 'new' }]
  ]);
  assert.deepEqual(__test.compareSnapshots(null, after), []);
  assert.deepEqual(__test.compareSnapshots(before, after), [
    { type: 'changed', title: 'Planning' },
    { type: 'added', title: 'New event' }
  ]);
});

test('public-link sync uses conditional requests and reports changed events', async () => {
  const originalFetch = global.fetch;
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const eventFeed = title => `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:meeting-1
DTSTART:${icalTime(start)}
DTEND:${icalTime(new Date(start.getTime() + 30 * 60 * 1000))}
SUMMARY:${title}
END:VEVENT
END:VCALENDAR`;
  let revision = 1;
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://p01-caldav.icloud.com/published/2/example');
    assert.equal(options.headers.Authorization, undefined);
    if (revision === 1 && options.headers['If-None-Match'] === '"v1"') return new Response(null, { status: 304 });
    const tag = '"v' + revision + '"';
    return new Response(eventFeed(revision === 1 ? 'Planning' : 'Planning & review'), {
      status: 200,
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', ETag: tag }
    });
  };
  try {
    calendar.configure('webcal://p01-caldav.icloud.com/published/2/example');
    const first = await calendar.sync();
    assert.equal(first.events[0].title, 'Planning');
    assert.deepEqual(first.changes, []);

    const unchanged = await calendar.sync();
    assert.deepEqual(unchanged.changes, []);
    assert.equal(unchanged.events[0].title, 'Planning');

    revision = 2;
    const changed = await calendar.sync();
    assert.equal(changed.events[0].title, 'Planning & review');
    assert.deepEqual(changed.changes, [{ type: 'changed', title: 'Planning & review' }]);
  } finally {
    calendar.disconnect();
    global.fetch = originalFetch;
  }
});
