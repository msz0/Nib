const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { create, normalize } = require('../local-calendar');

test('local events validate dates and persist edits and Google links', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nib-calendar-'));
  try {
    const store = create(path.join(dir, 'events.json'));
    const event = store.createEvent({
      title: 'Planning',
      start: '2026-12-01T10:00',
      end: '2026-12-01T11:00',
      location: 'Studio'
    });
    assert.equal(event.source, 'nib');
    assert.equal(event.location, 'Studio');
    assert.equal(store.linkGoogle(event.id, 'google-event-1').googleId, 'google-event-1');
    assert.equal(store.updateEvent(event.id, { ...event, title: 'Review' }).title, 'Review');
    assert.equal(create(path.join(dir, 'events.json')).list()[0].googleId, 'google-event-1');
    store.deleteEvent(event.id);
    assert.deepEqual(store.list(), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('local events reject empty titles, invalid all-day dates, and reversed times', () => {
  assert.throws(() => normalize({ title: ' ', start: '2026-12-01T10:00', end: '2026-12-01T11:00' }), /title/i);
  assert.throws(() => normalize({ title: 'Bad date', allDay: true, start: '2026-02-31', end: '2026-03-01' }), /valid end time/i);
  assert.throws(() => normalize({ title: 'Reversed', start: '2026-12-01T11:00', end: '2026-12-01T10:00' }), /valid end time/i);
});
