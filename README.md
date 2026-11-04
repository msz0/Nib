# Nib: a dark little notch for Windows 11

Hover the pill at the top of the screen and it opens into a grid of tools. Everything works without Claude Code.

## Resting pill
Two white rounded-square eyes that look around, blink and squish. Show the time, battery, CPU, RAM or your next event on either side (Settings > Island). While music plays it shows the song with its logo and the lyric line being sung.

## Opened (hover, or click if you prefer)
- **Home**: tiles for Music, Focus, Notes, Clipboard, Files, Calendar and more. Tap a tile or use the bar at the bottom.
- **Music**: album art, synced lyrics (previous, current, next line), progress, Prev / Play-Pause / Next. These only ever control your chosen player (Spotify by default), never a browser, so Netflix and YouTube are untouched.
- **Notes**: a built-in notepad with several notes, saved on this PC as you type.
- **Clipboard**: your last copies; click one to copy it again. Kept in memory only.
- **Focus**: 5 to 180 minutes, colored by intensity. **Coffee**: keep the PC awake. **System**: CPU, RAM, battery.
- **Files**: drag files over the island and drop them on a zone; Tidy Downloads; Undo.
- **Calendar** (private ICS link, chimes when an event starts), **Apps** launcher, **Discord** mute/deafen, **Chat** (your own Anthropic API key), **Claude Code** (shows what it's doing, Allow/Deny from the island).
The ... menu has All apps, Settings, Fold in and Quit.

## Spotify lyrics, synced
Settings > Music: create an app at developer.spotify.com/dashboard, add the Redirect URI `http://127.0.0.1:47821/spotify/callback`, paste the Client ID, press Connect. Nib then reads your exact playback position through Spotify's official API. Spotify has no lyrics endpoint in that API, so the lyric text comes from LRCLIB (lrclib.net), matched to your track and length.

## Running it
- **Nib.exe** (portable zip): unzip, double-click. SmartScreen may warn because it's unsigned: More info > Run anyway.
- **From source**: double-click `Start Nib.bat` (installs Node.js via winget once if needed). Edit in VS Code with `code .`.
