-- Nib admin control plane.
-- Apply with Supabase SQL Editor. Do not expose a service_role key to the browser or desktop app.

create table if not exists public.nib_team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'developer')),
  created_at timestamptz not null default now()
);

create table if not exists public.nib_installations (
  installation_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app_version text not null default '',
  platform text not null default 'windows',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  telemetry_consent boolean not null default false,
  constraint nib_installations_version_len check (char_length(app_version) <= 40),
  constraint nib_installations_platform check (platform in ('windows'))
);

create table if not exists public.nib_usage_daily (
  installation_id uuid not null references public.nib_installations(installation_id) on delete cascade,
  day date not null default current_date,
  feature_key text not null check (feature_key in (
    'media', 'focus', 'notes', 'clipboard', 'files', 'calendar', 'apps',
    'discord', 'chat', 'coffee', 'system', 'screen_tools', 'voice_memo', 'claude'
  )),
  event_count integer not null default 0 check (event_count between 0 and 100000),
  primary key (installation_id, day, feature_key)
);

create table if not exists public.nib_diagnostics (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.nib_installations(installation_id) on delete cascade,
  app_version text not null default '',
  component text not null,
  error_code text not null,
  created_at timestamptz not null default now(),
  constraint nib_diagnostics_component_len check (char_length(component) between 1 and 80),
  constraint nib_diagnostics_code_len check (char_length(error_code) between 1 and 80),
  constraint nib_diagnostics_version_len check (char_length(app_version) <= 40)
);

create table if not exists public.nib_admin_actions (
  id uuid primary key default gen_random_uuid(),
  target_installation_id uuid not null references public.nib_installations(installation_id) on delete cascade,
  action_type text not null check (action_type in ('require_update', 'feature_flag', 'repair_action', 'diagnostics_request')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'delivered', 'completed', 'failed')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  result_summary text not null default '',
  constraint nib_action_result_len check (char_length(result_summary) <= 500),
  constraint nib_action_payload_size check (octet_length(payload::text) <= 2048),
  constraint nib_action_payload_allowlist check (
    (action_type = 'require_update'
      and payload ? 'minimum_version'
      and payload->>'minimum_version' ~ '^[0-9]+\.[0-9]+\.[0-9]+([-+][A-Za-z0-9.-]+)?$'
      and payload - 'minimum_version' = '{}'::jsonb)
    or
    (action_type = 'feature_flag'
      and payload ? 'key' and payload ? 'enabled'
      and payload->>'key' in ('calendar.google', 'screen.ocr', 'voice.memo', 'ai.chat')
      and jsonb_typeof(payload->'enabled') = 'boolean'
      and payload - 'key' - 'enabled' = '{}'::jsonb)
    or
    (action_type = 'repair_action'
      and payload ? 'repair'
      and payload->>'repair' in ('retry_calendar_sync', 'refresh_app_state')
      and payload - 'repair' = '{}'::jsonb)
    or
    (action_type = 'diagnostics_request' and payload = '{}'::jsonb)
  )
);

create or replace function public.nib_is_team_member()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.nib_team_members
    where user_id = auth.uid()
  );
$$;

create or replace function public.nib_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.nib_team_members
    where user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.nib_ack_admin_action(
  p_action_id uuid,
  p_status text,
  p_result_summary text default ''
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or p_status not in ('delivered', 'completed', 'failed') then
    raise exception 'Invalid action acknowledgement.';
  end if;
  if char_length(coalesce(p_result_summary, '')) > 500 then
    raise exception 'Result summary is too long.';
  end if;
  update public.nib_admin_actions a
    set status = p_status,
        result_summary = coalesce(p_result_summary, ''),
        completed_at = case when p_status in ('completed', 'failed') then now() else null end
    where a.id = p_action_id
      and (
        (a.status = 'queued' and p_status in ('delivered', 'completed', 'failed'))
        or (a.status = 'delivered' and p_status in ('completed', 'failed'))
      )
      and exists (
        select 1 from public.nib_installations i
        where i.installation_id = a.target_installation_id
          and i.user_id = auth.uid()
      );
  if not found then
    raise exception 'Action not found or not assigned to this account.';
  end if;
end;
$$;

create or replace function public.nib_revoke_telemetry(p_installation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.nib_installations
    set telemetry_consent = false, last_seen_at = null, app_version = ''
    where installation_id = p_installation_id and user_id = auth.uid();
  if not found then
    raise exception 'Installation not found for this account.';
  end if;
  delete from public.nib_usage_daily where installation_id = p_installation_id;
  delete from public.nib_diagnostics where installation_id = p_installation_id;
end;
$$;

create or replace function public.nib_preserve_admin_access()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.role = 'admin' then
    if tg_op = 'DELETE' then
      if (select count(*) from public.nib_team_members where role = 'admin') <= 1 then
        raise exception 'The last admin cannot be removed.';
      end if;
      return old;
    elsif new.role <> 'admin' then
      if (select count(*) from public.nib_team_members where role = 'admin') <= 1 then
        raise exception 'The last admin cannot be demoted.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists nib_preserve_admin_access on public.nib_team_members;
create trigger nib_preserve_admin_access
before update or delete on public.nib_team_members
for each row execute function public.nib_preserve_admin_access();

alter table public.nib_team_members enable row level security;
alter table public.nib_installations enable row level security;
alter table public.nib_usage_daily enable row level security;
alter table public.nib_diagnostics enable row level security;
alter table public.nib_admin_actions enable row level security;

drop policy if exists nib_team_read_members on public.nib_team_members;
create policy nib_team_read_members on public.nib_team_members
  for select to authenticated
  using (user_id = auth.uid() or public.nib_is_team_member());
drop policy if exists nib_admin_insert_members on public.nib_team_members;
create policy nib_admin_insert_members on public.nib_team_members
  for insert to authenticated
  with check (public.nib_is_admin());
drop policy if exists nib_admin_update_members on public.nib_team_members;
create policy nib_admin_update_members on public.nib_team_members
  for update to authenticated
  using (public.nib_is_admin())
  with check (public.nib_is_admin());
drop policy if exists nib_admin_delete_members on public.nib_team_members;
create policy nib_admin_delete_members on public.nib_team_members
  for delete to authenticated
  using (public.nib_is_admin());

drop policy if exists nib_installation_read_own_or_team on public.nib_installations;
create policy nib_installation_read_own_or_team on public.nib_installations
  for select to authenticated
  using (user_id = auth.uid() or public.nib_is_team_member());
drop policy if exists nib_installation_insert_consented_self on public.nib_installations;
create policy nib_installation_insert_consented_self on public.nib_installations
  for insert to authenticated
  with check (user_id = auth.uid() and telemetry_consent = true);
drop policy if exists nib_installation_update_consented_self on public.nib_installations;
drop policy if exists nib_installation_update_self on public.nib_installations;
create policy nib_installation_update_self on public.nib_installations
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists nib_usage_read_own_or_team on public.nib_usage_daily;
create policy nib_usage_read_own_or_team on public.nib_usage_daily
  for select to authenticated
  using (
    public.nib_is_team_member()
    or exists (
      select 1 from public.nib_installations i
      where i.installation_id = nib_usage_daily.installation_id
        and i.user_id = auth.uid() and i.telemetry_consent
    )
  );
drop policy if exists nib_usage_insert_consented_self on public.nib_usage_daily;
create policy nib_usage_insert_consented_self on public.nib_usage_daily
  for insert to authenticated
  with check (exists (
    select 1 from public.nib_installations i
    where i.installation_id = nib_usage_daily.installation_id
      and i.user_id = auth.uid() and i.telemetry_consent
  ));
drop policy if exists nib_usage_update_consented_self on public.nib_usage_daily;
create policy nib_usage_update_consented_self on public.nib_usage_daily
  for update to authenticated
  using (exists (
    select 1 from public.nib_installations i
    where i.installation_id = nib_usage_daily.installation_id
      and i.user_id = auth.uid() and i.telemetry_consent
  ))
  with check (exists (
    select 1 from public.nib_installations i
    where i.installation_id = nib_usage_daily.installation_id
      and i.user_id = auth.uid() and i.telemetry_consent
  ));

drop policy if exists nib_diagnostics_read_team on public.nib_diagnostics;
create policy nib_diagnostics_read_team on public.nib_diagnostics
  for select to authenticated using (public.nib_is_team_member());
drop policy if exists nib_diagnostics_insert_consented_self on public.nib_diagnostics;
create policy nib_diagnostics_insert_consented_self on public.nib_diagnostics
  for insert to authenticated
  with check (exists (
    select 1 from public.nib_installations i
    where i.installation_id = nib_diagnostics.installation_id
      and i.user_id = auth.uid() and i.telemetry_consent
  ));

drop policy if exists nib_actions_read_team_or_owner on public.nib_admin_actions;
create policy nib_actions_read_team_or_owner on public.nib_admin_actions
  for select to authenticated
  using (
    public.nib_is_team_member()
    or exists (
      select 1 from public.nib_installations i
      where i.installation_id = nib_admin_actions.target_installation_id
        and i.user_id = auth.uid()
    )
  );
drop policy if exists nib_actions_insert_team on public.nib_admin_actions;
create policy nib_actions_insert_team on public.nib_admin_actions
  for insert to authenticated
  with check (public.nib_is_team_member() and created_by = auth.uid());

grant select, insert, update, delete on public.nib_team_members to authenticated;
grant select, insert, update on public.nib_installations to authenticated;
grant select, insert, update on public.nib_usage_daily to authenticated;
grant select, insert on public.nib_diagnostics to authenticated;
grant select, insert on public.nib_admin_actions to authenticated;
revoke all on function public.nib_ack_admin_action(uuid, text, text) from public, anon;
revoke all on function public.nib_revoke_telemetry(uuid) from public, anon;
revoke all on function public.nib_is_team_member() from public, anon;
revoke all on function public.nib_is_admin() from public, anon;
grant execute on function public.nib_is_team_member() to authenticated;
grant execute on function public.nib_is_admin() to authenticated;
grant execute on function public.nib_ack_admin_action(uuid, text, text) to authenticated;
grant execute on function public.nib_revoke_telemetry(uuid) to authenticated;

-- Bootstrap the first admin only after inviting that person through Supabase Auth:
-- insert into public.nib_team_members (user_id, role)
-- select id, 'admin' from auth.users where lower(email) = lower('you@example.com')
-- on conflict (user_id) do update set role = 'admin';
