-- CM Library core schema for Supabase Auth, PostgreSQL, and Storage.
-- Apply to a new project only after reviewing the migration and making a backup.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  mobile text unique,
  role text not null default 'student' check (role in ('super_admin', 'library_admin', 'student')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.libraries (
  id uuid primary key default extensions.gen_random_uuid(),
  public_code text not null unique default ('GL-' || lpad((floor(random() * 900000 + 100000))::text, 6, '0')),
  admin_id uuid not null unique references public.profiles(id),
  name text not null,
  place text not null,
  seat_count integer not null check (seat_count > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'suspended')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.library_applications (
  id uuid primary key default extensions.gen_random_uuid(),
  admin_id uuid not null references public.profiles(id),
  library_name text not null,
  place text not null,
  seat_count integer not null check (seat_count > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  library_id uuid not null references public.libraries(id) on delete cascade,
  plan text not null,
  amount numeric(12,2) not null check (amount >= 0),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  payment_status text not null check (payment_status in ('paid', 'pending', 'failed')),
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  library_id uuid not null references public.libraries(id) on delete cascade,
  seat_number integer,
  fee numeric(12,2) not null default 0 check (fee >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'blocked')),
  requested_at timestamptz not null default now(),
  membership_code text unique,
  unique (library_id, seat_number)
);

create table if not exists public.attendance (
  id uuid primary key default extensions.gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  library_id uuid not null references public.libraries(id) on delete cascade,
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz
);

create table if not exists public.notices (
  id uuid primary key default extensions.gen_random_uuid(),
  library_id uuid references public.libraries(id) on delete cascade,
  title text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.pin_resets (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'completed', 'rejected'))
);

create table if not exists public.fee_payments (
  id uuid primary key default extensions.gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  library_id uuid not null references public.libraries(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  fee_month date not null,
  paid_on date not null default current_date,
  note text not null default '',
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (student_id, fee_month)
);

create table if not exists public.expenses (
  id uuid primary key default extensions.gen_random_uuid(),
  library_id uuid not null references public.libraries(id) on delete cascade,
  title text not null,
  category text not null,
  amount numeric(12,2) not null check (amount > 0),
  spent_on date not null default current_date,
  note text not null default '',
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Backup metadata is visible only to Super Admins. Secret material and backup
-- payloads are never stored in PostgreSQL or exposed to app clients.
create table if not exists public.backup_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  backup_type text not null check (backup_type in ('database', 'storage', 'full', 'restore_test', 'restore')),
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'verified')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  size_bytes bigint,
  retention_until timestamptz,
  storage_object_key text,
  checksum_sha256 text,
  integrity_verified_at timestamptz,
  staging_verified_at timestamptz,
  created_by uuid references public.profiles(id),
  error_code text,
  error_message text
);

create table if not exists public.backup_events (
  id uuid primary key default extensions.gen_random_uuid(),
  backup_job_id uuid references public.backup_jobs(id) on delete set null,
  event_type text not null check (event_type in ('backup_started', 'backup_succeeded', 'backup_failed', 'restore_started', 'restore_succeeded', 'restore_failed', 'integrity_check', 'staging_restore_test', 'notification_failed')),
  occurred_at timestamptz not null default now(),
  actor_id uuid references public.profiles(id),
  details jsonb not null default '{}'::jsonb
);

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'super_admin' and p.active) $$;

create or replace function public.is_library_admin(target_library uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.libraries l join public.profiles p on p.id = l.admin_id where l.id = target_library and l.admin_id = (select auth.uid()) and l.status = 'approved' and p.role = 'library_admin' and p.active) $$;

create or replace function public.my_library_id()
returns uuid language sql stable security definer set search_path = public
as $$ select l.id from public.libraries l where l.admin_id = (select auth.uid()) and l.status = 'approved' limit 1 $$;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, name, mobile, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    nullif(new.phone, ''),
    case when new.raw_user_meta_data ->> 'account_type' = 'library_admin' then 'library_admin' else 'student' end
  ) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

create or replace function public.prevent_profile_role_change()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_super_admin() then
    raise exception 'Only a Super Admin can change account roles';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_role_guard on public.profiles;
create trigger profiles_role_guard before update of role on public.profiles
for each row execute procedure public.prevent_profile_role_change();

alter table public.profiles enable row level security;
alter table public.libraries enable row level security;
alter table public.library_applications enable row level security;
alter table public.subscriptions enable row level security;
alter table public.students enable row level security;
alter table public.attendance enable row level security;
alter table public.notices enable row level security;
alter table public.pin_resets enable row level security;
alter table public.fee_payments enable row level security;
alter table public.expenses enable row level security;
alter table public.backup_jobs enable row level security;
alter table public.backup_events enable row level security;

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.libraries to authenticated;
grant select, insert, update on public.library_applications to authenticated;
grant select on public.subscriptions to authenticated;
grant select, insert, update on public.students to authenticated;
grant select, insert, update on public.attendance to authenticated;
grant select, insert, update, delete on public.notices to authenticated;
grant select, insert, update on public.pin_resets to authenticated;
grant select, insert on public.fee_payments to authenticated;
grant select, insert on public.expenses to authenticated;
grant select on public.backup_jobs, public.backup_events to authenticated;

create policy profiles_read_self_or_super on public.profiles for select to authenticated
using (id = (select auth.uid()) or public.is_super_admin());
create policy profiles_update_self_or_super on public.profiles for update to authenticated
using (id = (select auth.uid()) or public.is_super_admin())
with check (id = (select auth.uid()) or public.is_super_admin());

create policy libraries_read_approved_or_managed on public.libraries for select to authenticated
using (status = 'approved' or admin_id = (select auth.uid()) or public.is_super_admin());
create policy library_applications_read_owner_or_super on public.library_applications for select to authenticated
using (admin_id = (select auth.uid()) or public.is_super_admin());
create policy library_applications_submit_owner on public.library_applications for insert to authenticated
with check (admin_id = (select auth.uid()) and (select p.role = 'library_admin' from public.profiles p where p.id = (select auth.uid())));
create policy library_applications_review_super on public.library_applications for update to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create policy subscriptions_super_read on public.subscriptions for select to authenticated
using (public.is_super_admin());
create policy students_read_scoped on public.students for select to authenticated
using (user_id = (select auth.uid()) or public.is_library_admin(library_id) or public.is_super_admin());
create policy students_write_scoped on public.students for all to authenticated
using (public.is_library_admin(library_id) or public.is_super_admin())
with check (public.is_library_admin(library_id) or public.is_super_admin());
create policy attendance_read_scoped on public.attendance for select to authenticated
using (exists (select 1 from public.students s where s.id = student_id and s.user_id = (select auth.uid())) or public.is_library_admin(library_id) or public.is_super_admin());
create policy attendance_write_admin on public.attendance for all to authenticated
using (public.is_library_admin(library_id) or public.is_super_admin())
with check (public.is_library_admin(library_id) or public.is_super_admin());
create policy notices_read_scoped on public.notices for select to authenticated
using (library_id is null or public.is_super_admin() or public.is_library_admin(library_id) or exists (select 1 from public.students s where s.library_id = notices.library_id and s.user_id = (select auth.uid()) and s.status = 'approved'));
create policy notices_admin_manage on public.notices for all to authenticated
using (public.is_super_admin() or (library_id is not null and public.is_library_admin(library_id)))
with check (public.is_super_admin() or (library_id is not null and public.is_library_admin(library_id)));
create policy pin_resets_student_create on public.pin_resets for insert to authenticated
with check (user_id = (select auth.uid()));
create policy pin_resets_scoped_read on public.pin_resets for select to authenticated
using (user_id = (select auth.uid()) or public.is_super_admin() or exists (select 1 from public.students s where s.user_id = pin_resets.user_id and public.is_library_admin(s.library_id)));
create policy fees_scoped on public.fee_payments for select to authenticated
using (public.is_super_admin() or public.is_library_admin(library_id) or exists (select 1 from public.students s where s.id = student_id and s.user_id = (select auth.uid())));
create policy fees_admin_insert on public.fee_payments for insert to authenticated
with check ((public.is_super_admin() or public.is_library_admin(library_id)) and recorded_by = (select auth.uid()));
create policy expenses_admin_read on public.expenses for select to authenticated
using (public.is_super_admin() or public.is_library_admin(library_id));
create policy expenses_admin_insert on public.expenses for insert to authenticated
with check ((public.is_super_admin() or public.is_library_admin(library_id)) and recorded_by = (select auth.uid()));
create policy backup_jobs_super_read on public.backup_jobs for select to authenticated using (public.is_super_admin());
create policy backup_events_super_read on public.backup_events for select to authenticated using (public.is_super_admin());

insert into storage.buckets(id, name, public, file_size_limit)
values ('library-files', 'library-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy library_files_read_scoped on storage.objects for select to authenticated
using (
  bucket_id = 'library-files' and (
    public.is_super_admin()
    or public.is_library_admin((storage.foldername(name))[1]::uuid)
    or exists (
      select 1 from public.students s
      where s.library_id = (storage.foldername(name))[1]::uuid
        and s.user_id = (select auth.uid())
        and s.status = 'approved'
        and (storage.foldername(name))[2] = (select auth.uid())::text
    )
  )
);
create policy library_files_insert_scoped on storage.objects for insert to authenticated
with check (
  bucket_id = 'library-files' and (
    public.is_super_admin()
    or public.is_library_admin((storage.foldername(name))[1]::uuid)
    or exists (
      select 1 from public.students s
      where s.library_id = (storage.foldername(name))[1]::uuid
        and s.user_id = (select auth.uid())
        and s.status = 'approved'
        and (storage.foldername(name))[2] = (select auth.uid())::text
    )
  )
);
create policy library_files_update_scoped on storage.objects for update to authenticated
using (bucket_id = 'library-files' and (public.is_super_admin() or public.is_library_admin((storage.foldername(name))[1]::uuid)))
with check (bucket_id = 'library-files' and (public.is_super_admin() or public.is_library_admin((storage.foldername(name))[1]::uuid)));
create policy library_files_delete_scoped on storage.objects for delete to authenticated
using (bucket_id = 'library-files' and (public.is_super_admin() or public.is_library_admin((storage.foldername(name))[1]::uuid)));
