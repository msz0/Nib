# Nib Calendar

Nib now has a standalone month calendar with local events and optional Google and Apple sources. Open it from the island’s Calendar tab or Settings → Connections.

## Google Calendar setup

Google requires an OAuth application owned by the app publisher. Nib does not use a Google password or ask users for a private API key.

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create or select a project and enable the Google Calendar API.
2. Configure the OAuth consent screen. While the app is in Testing, add each account that will connect as a test user. Google may expire test refresh tokens after seven days; publish and complete Google’s verification requirements before distributing broadly.
3. Create an OAuth client ID with application type **Desktop app**.
4. In Nib Settings → Connections → Google Calendar, paste the client ID ending in `.apps.googleusercontent.com`, then choose **Connect Google** and approve access in the browser.

The client ID is a public app identifier. Each person authorizes their own Google account; Nib stores that account’s refresh token encrypted with Windows secure storage. Access is limited to calendar events on the account’s primary calendar. Disconnect from Settings to remove Nib’s locally stored connection.

Nib-created events are saved locally and, while Google is connected, created or updated in Google Calendar too. Existing local events are copied to Google when a connection is first established. Google events can be edited and deleted from Nib, and linked events refresh from Google’s latest details. If Google sync fails, the event remains in Nib and the error is shown; it can be edited to retry. Apple’s public iCloud link remains read-only.

## Changed files

- `calendar.html` — standalone month grid, event editor, and day agenda.
- `index.html` — Calendar tab entry point and upcoming-event summary.
- `settings.html` — Google Calendar connection and OAuth client-ID setup.
- `main.js` — calendar window, per-user event storage, provider IPC, Google sync.
- `preload.js` — narrow renderer APIs for calendar events and Google connection.
- `calendar.js` — ranged Apple Calendar event expansion for month views.
- `google-calendar.js` — Google OAuth PKCE, encrypted refresh-token handling, and Calendar API.
- `local-calendar.js` — validated local event persistence and Google event links.
- `test/calendar.test.js`, `test/local-calendar.test.js`, `test/google-calendar.test.js` — focused coverage for ranged Apple events, local event storage, and Google event conversion.
