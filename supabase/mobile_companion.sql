-- JINHUA mobile companion: authenticated single-user inbox and project snapshots.
-- Run in the intended Supabase project's SQL editor after rotating any exposed keys.

create extension if not exists pgcrypto;

create table if not exists public.mobile_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace text not null check (workspace in ('xinxuan','personal')),
  kind text not null check (kind in ('text','voice','image','video','document','link')),
  title text not null default '',
  body text not null default '',
  source_url text,
  file_path text,
  file_name text,
  mime_type text,
  status text not null default 'inbox' check (status in ('inbox','imported','archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  imported_at timestamptz
);

create index if not exists mobile_inbox_user_created_idx on public.mobile_inbox(user_id,created_at desc);
alter table public.mobile_inbox enable row level security;
revoke all on public.mobile_inbox from anon;
grant select,insert,update,delete on public.mobile_inbox to authenticated;

drop policy if exists "mobile inbox select own" on public.mobile_inbox;
create policy "mobile inbox select own" on public.mobile_inbox for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists "mobile inbox insert own" on public.mobile_inbox;
create policy "mobile inbox insert own" on public.mobile_inbox for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists "mobile inbox update own" on public.mobile_inbox;
create policy "mobile inbox update own" on public.mobile_inbox for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists "mobile inbox delete own" on public.mobile_inbox;
create policy "mobile inbox delete own" on public.mobile_inbox for delete to authenticated using ((select auth.uid())=user_id);

create table if not exists public.mobile_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace text not null check (workspace in ('xinxuan','personal')),
  source_id text not null,
  kind text not null check (kind in ('project','topic')),
  title text not null,
  summary text not null default '',
  status text not null default '',
  target_date text not null default '',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(user_id,workspace,source_id)
);

alter table public.mobile_projects enable row level security;
revoke all on public.mobile_projects from anon;
grant select,insert,update,delete on public.mobile_projects to authenticated;

drop policy if exists "mobile projects select own" on public.mobile_projects;
create policy "mobile projects select own" on public.mobile_projects for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists "mobile projects insert own" on public.mobile_projects;
create policy "mobile projects insert own" on public.mobile_projects for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists "mobile projects update own" on public.mobile_projects;
create policy "mobile projects update own" on public.mobile_projects for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists "mobile projects delete own" on public.mobile_projects;
create policy "mobile projects delete own" on public.mobile_projects for delete to authenticated using ((select auth.uid())=user_id);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('mobile-inbox','mobile-inbox',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','audio/webm','audio/mp4','audio/mpeg','audio/wav','application/pdf','text/plain'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "mobile storage select own" on storage.objects;
create policy "mobile storage select own" on storage.objects for select to authenticated using (bucket_id='mobile-inbox' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "mobile storage insert own" on storage.objects;
create policy "mobile storage insert own" on storage.objects for insert to authenticated with check (bucket_id='mobile-inbox' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "mobile storage update own" on storage.objects;
create policy "mobile storage update own" on storage.objects for update to authenticated using (bucket_id='mobile-inbox' and (storage.foldername(name))[1]=(select auth.uid())::text) with check (bucket_id='mobile-inbox' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "mobile storage delete own" on storage.objects;
create policy "mobile storage delete own" on storage.objects for delete to authenticated using (bucket_id='mobile-inbox' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Full workbench sync. One private snapshot is kept for each user/workspace.
-- Media stays in a separate private bucket and is only readable by its owner.
create table if not exists public.workbench_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace text not null check (workspace in ('xinxuan','personal')),
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  device_id text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id,workspace)
);

alter table public.workbench_snapshots enable row level security;
revoke all on public.workbench_snapshots from anon;
grant select,insert,update,delete on public.workbench_snapshots to authenticated;

drop policy if exists "workbench snapshots select own" on public.workbench_snapshots;
create policy "workbench snapshots select own" on public.workbench_snapshots for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists "workbench snapshots insert own" on public.workbench_snapshots;
create policy "workbench snapshots insert own" on public.workbench_snapshots for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists "workbench snapshots update own" on public.workbench_snapshots;
create policy "workbench snapshots update own" on public.workbench_snapshots for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
drop policy if exists "workbench snapshots delete own" on public.workbench_snapshots;
create policy "workbench snapshots delete own" on public.workbench_snapshots for delete to authenticated using ((select auth.uid())=user_id);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('workbench-media','workbench-media',false,262144000,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm','audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/ogg','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','text/markdown'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "workbench media select own" on storage.objects;
create policy "workbench media select own" on storage.objects for select to authenticated using (bucket_id='workbench-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "workbench media insert own" on storage.objects;
create policy "workbench media insert own" on storage.objects for insert to authenticated with check (bucket_id='workbench-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "workbench media update own" on storage.objects;
create policy "workbench media update own" on storage.objects for update to authenticated using (bucket_id='workbench-media' and (storage.foldername(name))[1]=(select auth.uid())::text) with check (bucket_id='workbench-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "workbench media delete own" on storage.objects;
create policy "workbench media delete own" on storage.objects for delete to authenticated using (bucket_id='workbench-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
