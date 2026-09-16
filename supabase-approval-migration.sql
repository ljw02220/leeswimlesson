-- 회원가입 승인 흐름용 컬럼 / 테이블

alter table public.members
add column if not exists auth_user_id uuid;

alter table public.members
add column if not exists group_lessons jsonb not null default '[]'::jsonb;

revoke select, insert, update, delete
on public.members
from anon;

revoke select, insert, update, delete
on public.lessons
from anon;

revoke select, insert, update, delete
on public.personal_lesson_reports
from anon;

revoke select, insert, update, delete
on public.transactions
from anon;

drop policy if exists "anon members access"
on public.members;

create table if not exists public.signup_requests (
  id uuid primary key default gen_random_uuid(),

  auth_user_id uuid,
  login_email text not null,

  name text not null,
  phone text not null,

  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  rejected_at timestamptz,

  memo text
);

alter table public.signup_requests
enable row level security;

grant insert
on public.signup_requests
to anon;

grant select, insert, update, delete
on public.signup_requests
to authenticated;

drop policy if exists "anon signup requests insert"
on public.signup_requests;

create policy "anon signup requests insert"
on public.signup_requests
for insert
to anon
with check (true);

drop policy if exists "authenticated signup requests access"
on public.signup_requests;

create policy "authenticated signup requests access"
on public.signup_requests
for all
to authenticated
using (true)
with check (true);
