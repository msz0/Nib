# Nib — Current Features, Ideas, and File Map

This is an inventory of the features implemented in this Nib source copy, plus ideas for future work. Some integrations need their own account, key, device, or system software. Widgets can be enabled and reordered in **Settings → Apps**.

## What Nib can do now

### Desktop island and cat

- Expand on hover or click; attach to the top edge or float; adjust size, transparency, position, and lock state.
- Show a clock, battery, CPU, RAM, GPU temperature, or the next event while collapsed.
- Choose dark, light, night, or custom appearance; configure shortcuts and automatic Game Mode.
- Customize the cat’s fur and eye colors, personality, accessory, petting reaction, idle sleep, and animations.
- Save, load, rename, and delete custom workspace profiles; use Normal, Gamer, Working, and Streamer presets.

### Widgets and tools

| Feature | What it does |
|---|---|
| Media | Detect Windows media sessions; select a player; play/pause, skip, seek, view track details and artwork, and adjust the selected app’s volume. |
| Spotify | Optional account connection for precise playback position and controls; supports synced lyrics when available. |
| Focus | Run a 5–180 minute focus timer, stop it, or add five minutes; choose timer presets and completion sounds. |
| Notes | Create, edit, and delete notes saved on this PC. |
| Clipboard | Keep up to 12 recent text copies (up to 2,000 characters each) in memory, copy them again, remove entries, clear all, or export selected text. |
| Files | Drop files into folders sorted by type or configured destinations; tidy Downloads and undo the last move. |
| Calendar | View a month, add/edit/delete local events, and view Google and Apple events. Nib-created events are saved locally and sent to Google when connected. |
| Apps | Launch built-in favorites—such as Spotify, Discord, Gmail, YouTube, VS Code, Terminal, Steam, GitHub, Zoom, and Google Drive—or add your own program, URL, app link, or command; reorder the launcher. |
| Discord | Send configured mute and deafen hotkeys and open Discord. It does not show channel participants. |
| Chat | Talk to Nib using your own Anthropic API key. |
| Coffee | Keep the PC awake for 30 minutes, one hour, two hours, or indefinitely. |
| System | Show CPU, RAM, battery, and available NVIDIA GPU metrics (temperature, utilization, VRAM, power, and fan). |
| Screen tools | Read text from a screen selection, clipboard screenshot, or image; pick a screen color as HEX; draw on the desktop. |
| Voice memo | Record using a selected microphone, choose speaker output, play recordings, export, and delete them. Recordings are stored locally. |
| Claude Code | Show Claude Code activity in the island and optionally ask before Bash commands and edits. |

### Calendar connections and notices

- **Local:** Events created in Nib are stored on this PC.
- **Google Calendar:** Each person connects their own Google account. Nib can view and manage primary-calendar events; Nib-created events are also saved to Google while connected.
- **Apple Calendar:** Connect a public iCloud calendar link. It is read-only and refreshes every 30 seconds. Nib can notify when Apple events are added or changed.
- Calendar events can also use the configured sound when they start.

### Other built-in behavior

- What's New and release history, update checks in packaged installations, system-tray controls, and configurable notification sounds.
- The launcher includes common desktop apps and websites; settings allow custom launch targets.
- Nib runs as a Windows desktop app. The CPU/RAM and Windows media-session functions use Windows APIs; NVIDIA-specific metrics depend on `nvidia-smi`.

## Setup and current limitations

- Google Calendar needs a valid **Desktop OAuth Client ID**, the Calendar API enabled, and user consent. Nib stores the user’s refresh token encrypted using Windows secure storage.
- Apple Calendar needs a public iCloud link. Anyone who has that link can read the calendar, so keep it private.
- Spotify needs a Spotify app Client ID and account authorization. Synced lyrics are provided by LRCLIB when available; the lookup sends the song, artist, and duration.
- Chat needs the user’s Anthropic API key and uses the Anthropic API.
- OCR needs Tesseract available to Nib (bundled or installed).
- Discord actions are keyboard shortcuts configured to match Discord keybinds; there is no bot or participant/voice-channel integration.
- GPU metrics beyond CPU/RAM are not guaranteed on non-NVIDIA systems.
- Phone Link notifications, calendar connections to Outlook/Microsoft 365, local repeating-event rules, calendar export/import, and focus-session history are **not currently implemented**.

## Ideas for future features

These are suggestions, not existing Nib features.

1. **Calendar reminders and recurring local events** — configurable advance reminders, snooze, recurrence rules, and a clearer sync/retry state.
2. **Calendar import/export and backup** — move local events, notes, profiles, and settings between PCs; support standard ICS files.
3. **Clipboard privacy controls** — pause capture, exclude sensitive patterns, set a retention limit, and clear history automatically.
4. **Focus history** — completed-session log, daily totals, goals, and optional streaks.
5. **More hardware support** — AMD/Intel GPU metrics, better unavailable-device messages, and lightweight history charts.
6. **More calendar providers** — optional Outlook/Microsoft 365 connection, separate from the existing launcher shortcut.
7. **Quick actions** — user-defined keyboard shortcuts to open a widget, launch an app, start a focus timer, or run a selected command.

## Source file map

### Main app and interface

| File | What to change there |
|---|---|
| `main.js` | Electron startup, system tray, notifications, windows, settings persistence, application IPC, integrations, and native Windows behavior. |
| `preload.js` | Safe renderer-facing APIs. Add an API here when a page needs a new main-process capability. |
| `index.html` | Island interface, widget views, interactions, and cat rendering. |
| `settings.html` | Settings navigation and controls, profiles, widget ordering, and integration setup panels. |
| `calendar.html` | Standalone month calendar and event editor UI. |
| `icons.js` | Icon catalog used by Nib’s interface. |

### Feature logic and tool windows

| File | What to change there |
|---|---|
| `calendar.js` | Apple public-calendar URL validation, feed parsing, refresh, recurrence, and change detection. |
| `local-calendar.js` | Local event validation, persistence, and Google-link metadata. |
| `google-calendar.js` | Google OAuth/PKCE, token handling, and Google Calendar API calls. |
| `media.js` | Windows media-session discovery, player control, and seeking. |
| `spotify.js` | Spotify OAuth, playback API, and Spotify controls. |
| `lyrics.js` | Synced lyric lookup and timing. |
| `app-volume.js` | Per-application Windows audio-session volume. |
| `files.js` | File sorting, Downloads cleanup, and undo. |
| `position.js` | Island position and geometry helpers. |
| `chat.js` | Anthropic chat request and response behavior. |
| `claude-hooks.js` | Claude Code connection and activity/permission hooks. |
| `screen-tools.html` | OCR and captured-image tool interface. |
| `screen-region.html` | Screen area selection UI. |
| `live-color.html` | Live HEX picker window. |
| `live-draw.html` | Desktop drawing overlay. |
| `ocr-clipboard.ps1` | Windows clipboard-image helper used by OCR. |
| `server.js` | Local callback server used by Spotify sign-in. |

### Documentation, dependencies, and tests

| File or directory | Purpose |
|---|---|
| `README.md` | Existing project overview; check feature claims against current source when updating it. |
| `README-CALENDAR.md` | Calendar setup and calendar-related file list. |
| `README-APPLE-CALENDAR.md` | Apple Calendar setup notes. |
| `PRIVACY.md`, `SECURITY.md`, `README-SECURITY-SECTION.md` | Privacy and security documentation. |
| `CHANGELOG.md` | Release history. |
| `package.json`, `package-lock.json` | App metadata, scripts, and dependencies. |
| `test/` | Automated tests for calendar and other covered behavior. |

For changes that touch multiple parts of a feature, update the UI, the relevant feature module, `main.js`/`preload.js` if process communication changes, and focused tests together.
