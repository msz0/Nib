# Apple Calendar integration notes

This change is for the **Nib copy** only. It reads a **public iCloud Apple Calendar link**. It does not sign in to an Apple ID or connect to Google Calendar, Outlook Calendar, or arbitrary `.ics` providers.

## Connect a public calendar link

1. In Apple Calendar, open the calendar’s sharing options and enable **Public Calendar**.
2. Copy the public link (usually `webcal://…icloud.com/published/…`).
3. In Nib, open **Settings → Connections → Apple Calendar**, paste the link, then choose **Connect & sync**.

No Apple ID email or password is needed. Each Windows user can save their own public calendar link. Nib encrypts the link with Electron `safeStorage` in that user’s Nib `userData` directory as `apple-calendar-url.bin`; it is not written to `settings.json` or sent to a Nib server. A public calendar link grants read access to anyone who has it, so treat it like a secret. Disconnecting removes the saved link.

## Sync and notifications

- Nib refreshes iCloud calendar data every **30 seconds** while running.
- The calendar widget displays upcoming events from the next seven days.
- Native desktop notifications appear when a calendar event is added or changed. Connecting or starting Nib establishes a baseline, so existing events do not trigger a burst of notifications.
- The integration is read-only. It does not create, edit, or delete events.
- Nib only follows HTTPS links on iCloud hosts and will not send the link to a different host if Apple redirects it.

## Files changed

| File | Purpose |
|---|---|
| `calendar.js` | Public iCloud link validation, ICS parsing, conditional sync, event snapshots, and change detection. |
| `main.js` | Per-user encrypted link storage, connection IPC, 30-second polling, and desktop notifications. Retires the old generic ICS URL setting and removes the previous app-specific-password file. |
| `preload.js` | Narrow, renderer-safe methods for calendar status, connect/disconnect, and updates. |
| `settings.html` | Apple Calendar connection form, account status, and setup guidance under Connections. |
| `index.html` | Apple Calendar widget status, upcoming event refresh, and renderer updates. |
| `PRIVACY.md` | Documents encrypted public-link storage and iCloud feed requests. |
| `test/calendar.test.js` | Focused tests for iCloud URL validation, event filtering/diffing, and conditional sync. |
| `README-APPLE-CALENDAR.md` | This implementation and file map. |

`package.json` and `package-lock.json` were already modified before this integration; they were left untouched.

## Moving the change to the main repository

Copy the five implementation files listed above (`calendar.js`, `main.js`, `preload.js`, `settings.html`, and `index.html`) into the corresponding paths in the main repository. Copy `PRIVACY.md` if you want the privacy documentation updated there, and copy this note separately if you want to keep the setup and file map. No new package dependency, Apple password, or shared API key is required; `ical.js` was already present in this Nib copy.

## Local checks

Run the focused calendar unit tests with:

```powershell
node --test test/calendar.test.js
```
