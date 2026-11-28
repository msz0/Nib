const test = require('node:test');
const assert = require('node:assert/strict');
const { __test } = require('../google-calendar');

test('Google event responses normalize timed and all-day events', () => {
  assert.deepEqual(__test.normalizeGoogleEvent({
    id: 'timed-1',
    summary: 'Planning',
    start: { dateTime: '2026-12-01T10:00:00-05:00' },
    end: { dateTime: '2026-12-01T11:00:00-05:00' },
    location: 'Studio'
  }), {
    id: 'timed-1',
    googleId: 'timed-1',
    source: 'google',
    title: 'Planning',
    start: '2026-12-01T10:00:00-05:00',
    end: '2026-12-01T11:00:00-05:00',
    allDay: false,
    location: 'Studio',
    description: ''
  });
  assert.equal(__test.normalizeGoogleEvent({
    id: 'day-1', start: { date: '2026-12-25' }, end: { date: '2026-12-26' }
  }).allDay, true);
  assert.equal(__test.normalizeGoogleEvent({ id: 'cancelled', status: 'cancelled' }), null);
});
