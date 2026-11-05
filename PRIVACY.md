# Privacy Policy — Nib

**Last updated: November 5, 2026**

Nib is a Windows desktop companion. This document describes behavior visible in the Nib source code reviewed for this documentation. It is **not** a promise that third-party services, modified builds, or future releases behave identically.

## Account requirements

The core desktop app does not require a Nib account. Optional services such as Spotify and Anthropic may require their own accounts or credentials.

## Data stored or processed on your computer

| Feature | What Nib handles | Where / how |
| --- | --- | --- |
| Settings and customization | Widget choices, launcher preferences, file sorting destinations, calendar ICS link, and other settings | Local `settings.json` in the Electron user-data folder |
| Notes | Notes that you create | Local `notes.json` in the Electron user-data folder |
| Clipboard widget | Recent copied text, up to 12 entries of up to 2,000 characters each | Application memory while enabled; not intentionally written to a clipboard-history file |
| AI chat | Your prompts, recent chat context, and API key | Recent conversation held in application memory; API key stored locally using Electron `safeStorage` when supported |
| Spotify | Access and refresh tokens needed for the connection | Local encrypted token file using Electron `safeStorage` |
| File organizer | Paths of files you drop or choose to tidy | Files are moved locally; a limited Undo history is held in application memory |
| Claude Code integration | Events sent by Claude Code hooks, including tool names and some tool input | Delivered to the local Nib process for display or permission interaction |

**Important:** A private calendar ICS link is a credential-like secret: anyone who possesses it may be able to read the calendar. Nib stores the configured link in local settings; keep backups and screenshots containing it private.

## When Nib accesses the internet

Nib may communicate with the following services when features are used:

- **Anthropic API:** If you configure AI chat, your messages and limited recent conversation context are sent to the configured API endpoint with your API key. Consult Anthropic's privacy information for that service's handling of data.
- **Spotify:** If you connect Spotify, Nib uses Spotify's authorization and playback APIs to obtain and control playback state.
- **Calendar provider:** If you configure an ICS subscription, Nib fetches the calendar from the URL supplied. Your provider sees the request.
- **Lyrics and artwork services:** Music metadata may be used to retrieve lyrics or album artwork from third-party services.
- **GitHub / release infrastructure:** Packaged builds check for updates and can download an update after you agree.

This policy does **not** claim Nib works completely offline or that no network requests occur.

## What you can control

- Enable or remove widgets in Settings.
- Disconnect Spotify or Claude Code integration.
- Remove the saved AI chat API key using the tray menu.
- Clear the in-app clipboard list; quitting Nib also clears its in-memory clipboard history.
- Remove notes and settings from the app, where supported, or delete Nib's user-data folder after closing the app and backing up anything you want to retain.

Uninstalling the app may not automatically delete the Electron user-data folder. Deleting data on your device does not erase copies already submitted to third-party services.

## Security limitations

Nib's current implementation uses a local HTTP listener for integrations and offers functionality that can move files, open programs, and interact with Claude Code. Localhost-only access does not make those features risk-free. Do not assume clipboard content or integration events are appropriate for secrets.

## Changes to this policy

Update this file whenever Nib's data handling, integrations, permissions, or storage behavior changes. If a newer release behaves differently, the documentation for that release should take precedence.

## Questions and privacy concerns

Use the project's [GitHub issue tracker](https://github.com/msz0/nib/issues) for non-sensitive questions. Do not post credentials or private calendar URLs in public issues. For sensitive security reports, follow [SECURITY.md](SECURITY.md).
