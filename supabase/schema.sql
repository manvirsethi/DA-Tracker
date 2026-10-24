-- DA Tracker cloud schema
-- Run once in the SQL Editor of project rqvqjxbjljvzrpwnvkuy.
-- No existing tables are dropped. Mac SQLite remains untouched.

create table if not exists public.da_applications (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company text not null check (length(btrim(company)) > 0),
  programme text not null check (length(btrim(programme)) > 0),
  location text,
  url text,
  priority text not null default 'Normal' check (priority in ('High', 'Medium', 'Normal')),
  stage text not null default 'Not yet applied' check (length(btrim(stage)) > 0),
  status text not null default 'Active' check (status in ('Active','Rejected','Withdrawn','Closed','Archived')),
  date_added date not null default current_date,
  date_applied date,
  application_deadline date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_device text,
  legacy_id bigint,
  unique (id, owner_id),
  unique (owner_id, source_device, legacy_id)
);

create table if not exists public.da_application_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  application_id bigint not null,
  type text not null,
  from_stage text,
  to_stage text,
  note text,
  created_at timestamptz not null default now(),
  source_device text,
  legacy_id bigint,
  foreign key (application_id, owner_id)
    references public.da_applications(id, owner_id) on delete cascade,
  unique (owner_id, source_device, legacy_id)
);

create table if not exists public.da_deadlines (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  application_id bigint not null,
  title text not null check (length(btrim(title)) > 0),
  due_date date not null,
  completed integer not null default 0 check (completed in (0, 1)),
  created_at timestamptz not null default now(),
  source_device text,
  legacy_id bigint,
  foreign key (application_id, owner_id)
    references public.da_applications(id, owner_id) on delete cascade,
  unique (owner_id, source_device, legacy_id)
);

create index if not exists da_applications_owner_updated_idx
  on public.da_applications(owner_id, updated_at desc);
create index if not exists da_deadlines_owner_due_idx
  on public.da_deadlines(owner_id, due_date);
create index if not exists da_events_owner_application_idx
  on public.da_application_events(owner_id, application_id, created_at desc);

alter table public.da_applications enable row level security;
alter table public.da_application_events enable row level security;
alter table public.da_deadlines enable row level security;

-- A publishable API key alone must never grant read or write access.
revoke all on public.da_applications, public.da_application_events, public.da_deadlines from anon, public;
grant select, insert, update, delete on
  public.da_applications, public.da_application_events, public.da_deadlines
  to authenticated;
grant usage, select on sequence
  public.da_applications_id_seq,
  public.da_application_events_id_seq,
  public.da_deadlines_id_seq
  to authenticated;

create policy "da_applications_select_own" on public.da_applications
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "da_applications_insert_own" on public.da_applications
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "da_applications_update_own" on public.da_applications
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "da_applications_delete_own" on public.da_applications
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "da_events_select_own" on public.da_application_events
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "da_events_insert_own" on public.da_application_events
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "da_events_update_own" on public.da_application_events
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "da_events_delete_own" on public.da_application_events
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "da_deadlines_select_own" on public.da_deadlines
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "da_deadlines_insert_own" on public.da_deadlines
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "da_deadlines_update_own" on public.da_deadlines
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "da_deadlines_delete_own" on public.da_deadlines
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Trigger functions are security invoker, not security definer.
-- This keeps row-level security enforced during history writes.
create or replace function public.da_record_application_change()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.legacy_id is null then
      insert into public.da_application_events
        (owner_id, application_id, type, to_stage, note)
      values (new.owner_id, new.id, 'created', new.stage, 'Application added');
    end if;
  elsif tg_op = 'UPDATE' then
    if new.stage is distinct from old.stage then
      insert into public.da_application_events
        (owner_id, application_id, type, from_stage, to_stage)
      values (new.owner_id, new.id, 'stage_changed', old.stage, new.stage);
    end if;
    if new.status is distinct from old.status then
      insert into public.da_application_events
        (owner_id, application_id, type, from_stage, to_stage, note)
      values (
        new.owner_id, new.id,
        case when new.status = 'Active' then 'restored' else 'status_changed' end,
        new.stage, new.stage,
        case when new.status = 'Active'
          then 'Restored to active applications'
          else 'Marked ' || lower(new.status) end
      );
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.da_record_deadline_created()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.legacy_id is null then
    insert into public.da_application_events
      (owner_id, application_id, type, note)
    values (
      new.owner_id, new.application_id, 'deadline_added',
      new.title || ' due ' || to_char(new.due_date, 'YYYY-MM-DD')
    );
  end if;
  return new;
end;
$$;

create trigger da_application_audit_trigger
  after insert or update on public.da_applications
  for each row execute function public.da_record_application_change();

create trigger da_deadline_audit_trigger
  after insert on public.da_deadlines
  for each row execute function public.da_record_deadline_created();

-- After running, check Supabase Security Advisor and test as a real signed-in user.
