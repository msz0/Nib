# Security Policy

Nib is a Windows desktop companion built with Electron. This document explains how to report potential security problems and how to reduce risk when using Nib.

## Reporting a vulnerability

**Please do not publish exploitable details, credentials, or personal information in a public GitHub issue.**

If GitHub private vulnerability reporting is enabled for this repository, use **Security → Report a vulnerability** at https://github.com/msz0/nib/security.

If private reporting is not available, open a GitHub issue asking the maintainer for a private reporting channel **without including exploit steps or sensitive details**.

Useful information for a private report includes:
- The Nib version and Windows version affected.
- A concise description and steps to reproduce.
- Expected versus observed behavior.
- Potential impact and any relevant logs (with secrets removed).

There is currently no published security response-time guarantee. The maintainer will triage reports as capacity permits.

## Supported versions

Security fixes, when available, are expected to target the newest release. Older builds may not receive fixes. Check the [Releases](https://github.com/msz0/nib/releases) page for the latest available version.

## Security boundaries

- Nib runs as a local Electron application and can interact with desktop features you enable.
- The optional Claude Code integration can display or relay permission decisions for tool operations. Treat requests involving terminal commands or file modifications carefully.
- The clipboard widget reads copied text while enabled; do not use it for secrets unless you accept that risk.
- The file organizer can move files, including within Downloads. Review destinations and use Undo promptly if necessary.
- Nib runs a local HTTP listener at `127.0.0.1:47821` for optional integrations. Loopback binding does not by itself provide authentication against other local processes.
- Nib has online integrations (for example, Spotify, AI chat, calendar URLs, lyrics and update checks). See [PRIVACY.md](PRIVACY.md).

## Recommended precautions

1. Download releases from this repository; avoid modified installers from untrusted sources.
2. Keep Windows and dependencies updated; do not run Nib as administrator.
3. Leave optional integrations disconnected until needed.
4. Treat requests to execute commands, open programs, or move files as sensitive.
5. Do not put API keys, calendar subscription links, or authentication tokens in public bug reports.

## Security status

Open-source code is reviewable, but **Nib has not been represented here as independently audited or free of vulnerabilities**. A published release binary should not be assumed to match source code without independent verification or reproducible-build evidence.
