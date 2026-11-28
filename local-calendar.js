const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function localTime(value, allDay) {
  if (typeof value !== 'string') return NaN;
  if (allDay) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const [year, month, day] = value.split('-').map(Number);
    const time = Date.UTC(year, month - 1, day);
    const date = new Date(time);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? time : NaN;
  }
  return Date.parse(value);
}

function normalize(input) {
  if (!input || typeof input !== 'object') throw new Error('Enter event details.');
  const title = String(input.title || '').trim().slice(0, 180);
  const allDay = input.allDay === true;
  const start = String(input.start || '');
  const end = String(input.end || '');
  const startTime = localTime(start, allDay), endTime = localTime(end, allDay);
  if (!title) throw new Error('Add a title for this event.');
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    throw new Error('Choose a valid end time after the start time.');
  }
  if (endTime - startTime > 366 * 864e5) throw new Error('Events can’t be longer than one year.');
  return {
    title,
    start: allDay ? start : new Date(startTime).toISOString(),
    end: allDay ? end : new Date(endTime).toISOString(),
    allDay,
    location: String(input.location || '').trim().slice(0, 300),
    description: String(input.description || '').trim().slice(0, 2000)
  };
}

function create(file) {
  const read = () => {
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(value)) throw new Error('Saved calendar data is not a list.');
      return value;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw new Error('Could not read Nib’s saved events: ' + error.message);
    }
  };
  const write = events => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = file + '.tmp';
    try {
      fs.writeFileSync(temp, JSON.stringify(events), 'utf8');
      fs.renameSync(temp, file);
    } catch (error) {
      try { fs.rmSync(temp, { force: true }); } catch {}
      throw new Error('Could not save Nib’s events: ' + error.message);
    }
  };
  const list = () => read();
  const createEvent = input => {
    const event = { ...normalize(input), id: crypto.randomUUID(), source: 'nib', googleId: '' };
    const events = read();
    events.push(event);
    write(events);
    return event;
  };
  const updateEvent = (id, input) => {
    const events = read(), index = events.findIndex(event => event.id === id);
    if (index < 0) throw new Error('That Nib event no longer exists.');
    events[index] = { ...events[index], ...normalize(input), syncError: '' };
    write(events);
    return events[index];
  };
  const linkGoogle = (id, googleId) => {
    const events = read(), event = events.find(item => item.id === id);
    if (!event) throw new Error('The saved event disappeared before Google sync completed.');
    event.googleId = String(googleId);
    event.syncError = '';
    write(events);
    return event;
  };
  const setSyncError = (id, message) => {
    const events = read(), event = events.find(item => item.id === id);
    if (!event) return;
    event.syncError = String(message).slice(0, 300);
    write(events);
  };
  const unlinkGoogle = () => {
    const events = read();
    for (const event of events) { event.googleId = ''; event.syncError = ''; }
    write(events);
  };
  const deleteEvent = id => {
    const events = read(), remaining = events.filter(event => event.id !== id);
    if (remaining.length === events.length) throw new Error('That Nib event no longer exists.');
    write(remaining);
  };
  return { list, createEvent, updateEvent, linkGoogle, setSyncError, unlinkGoogle, deleteEvent };
}

module.exports = { create, normalize, __test: { normalize, localTime } };
