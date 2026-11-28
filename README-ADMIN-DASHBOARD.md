# Nib Admin Dashboard

This is the first-stage admin control plane for Nib. It uses Supabase email magic links and database-enforced roles. It never uses a Supabase `service_role` key in browser code.

## What works in this stage

- Invite-only team sign-in; accounts not assigned an admin/developer role are denied.
- Admins and developers can inspect opted-in installation IDs, app version, platform, last-seen time, consent state, and the action audit queue.
- Admins can add/remove team roles after the person has been invited to Supabase Auth. The database prevents removing or demoting the last admin.
- The UI can queue only constrained request types: minimum version, a small allowlist of feature flags, two predefined repair requests, or a consent-gated diagnostics request. Database constraints reject arbitrary scripts, commands, URLs, and unknown payload fields.
- The schema reserves privacy-minimized daily feature counts and diagnostic error codes. It does not collect notes, clipboard contents, calendar details, audio, API keys, or OAuth tokens.
- Users can revoke telemetry through a database function that disables future reporting and removes stored usage and diagnostic rows for that installation.

## Important limitation

The current Nib desktop app does **not** yet have Supabase account enrollment, opt-in telemetry upload, or an action-polling/repair agent. Therefore the dashboard will initially show no installations, and queued actions will not execute. This dashboard is the secured operator UI and database foundation; shipping the corresponding Nib client integration is a separate required step. Updates must ultimately use signed/verified Nib releases, and repair requests must remain a client-side allowlist—never remote shell or arbitrary code.

## Setup

1. Create a Supabase project. In **Authentication → URL Configuration**, add the HTTPS URL of the deployed `admin-dashboard.html` page to the allowed redirect URLs. Configure email magic links.
2. In **SQL Editor**, run [`supabase/admin-schema.sql`](supabase/admin-schema.sql).
3. Invite the first admin through Supabase Auth, then run the bootstrap `INSERT` at the bottom of the SQL file with that invited account’s email.
4. Put the project URL and its **public anon/publishable key** in `admin-config.js`. Never use the `service_role` key. The anon key is intended to be public; RLS and team membership provide authorization.
5. Host this folder on an HTTPS static host (for example, GitHub Pages or another static host). Do not open the page as a `file://` URL. If using a self-hosted Supabase URL, adjust the page CSP `connect-src` to that exact HTTPS origin.
6. To add a teammate, invite them in Supabase Auth first. Once they have an account, an admin can enter their Supabase user UUID in **Team access** and grant `developer` or `admin`.

The dashboard cannot create new Auth accounts from the browser; this prevents public self-registration and avoids putting privileged keys in the page.

## Safe operations

Action records are audit-logged and restricted by SQL payload checks:

- **Require update:** stores a minimum semantic version. The future Nib client must fetch only official signed releases and verify them before installation.
- **Feature flag:** accepts only `calendar.google`, `screen.ocr`, `voice.memo`, and `ai.chat`.
- **Repair:** accepts only `retry_calendar_sync` or `refresh_app_state`.
- **Diagnostics:** is only a request. A future desktop client must ask the user before sending limited error codes/version metadata.

At present these requests remain queued; there is no remote execution in the desktop app.

## File map

- `admin-dashboard.html` — dashboard layout and login/operation panels.
- `admin-dashboard.css` — responsive graphite operations-console styling.
- `admin-dashboard.js` — Supabase magic-link session, team-role checks, read views, team management, and allowlisted action queue.
- `admin-config.js` — project URL and public anon key placeholders; never put service credentials here.
- `supabase/admin-schema.sql` — tables, constraints, role checks, row-level security policies, and action acknowledgement function.
- `README-ADMIN-DASHBOARD.md` — setup, limitations, and this file map.

## Next required Nib-side work

1. Add account enrollment/sign-in and an explicit telemetry consent screen to Nib.
2. Generate and persist a random installation UUID; send only consented version/platform/last-seen and daily feature counts.
3. Poll `nib_admin_actions` for that installation and acknowledge results through `nib_ack_admin_action`.
4. Implement only the fixed repair/feature-flag actions and verified mandatory updates; prompt users before diagnostics.
5. Test RLS with a normal user, a developer, an admin, and an unauthenticated request before deploying.
