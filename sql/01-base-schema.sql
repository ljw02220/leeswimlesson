-- 01 기본 DB · 회원/수업/재무/가입 신청
-- Supabase SQL Editor에서 파일 전체를 실행하세요.
begin;

-- =========================================
-- 1. 회원 테이블
-- =========================================

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid,

  name text not null,
  phone text,

  lesson_format text,
  days text[],
  lesson_time time,
  lesson_start_date date,
  group_lessons jsonb not null default '[]'::jsonb,

  total_lessons integer not null default 0,
  used_lessons integer not null default 0,

  payment_amount integer not null default 0,
  payment_date date,
  payment_status text not null default '확인필요',
  residence_type text,
  payment_method text,
  personal_reported_at date,
  personal_reported_payment_date date,

  status text not null default '수강중',

  last_lesson_date date,
  memo text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.members
add column if not exists personal_reported_at date;

alter table public.members
add column if not exists personal_reported_payment_date date;

alter table public.members
add column if not exists lesson_start_date date;

alter table public.members
add column if not exists auth_user_id uuid;

alter table public.members
add column if not exists group_lessons jsonb not null default '[]'::jsonb;

alter table public.members
add column if not exists residence_type text;

alter table public.members
add column if not exists payment_method text;

-- =========================================
-- 2. 수업 테이블
-- =========================================

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),

  member_id uuid
    references public.members(id)
    on delete set null,

  lesson_date date not null,
  lesson_time time not null,

  title text,
  memo text,

  lesson_type text not null,
  status text not null default 'scheduled',

  source text not null default 'added',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lessons
add column if not exists memo text;

-- =========================================
-- 3. 개인레슨 보고 내역 테이블
-- =========================================

create table if not exists public.personal_lesson_reports (
  id uuid primary key default gen_random_uuid(),

  member_id uuid
    references public.members(id)
    on delete set null,

  member_name text not null,
  phone text,
  lesson_format text,
  days text[],
  lesson_time time,

  payment_amount integer not null default 0,
  payment_date date not null,
  payment_status text not null default '완납',
  residence_type text,
  payment_method text,

  reported_at date not null,
  memo text,

  created_at timestamptz not null default now()
);

alter table public.personal_lesson_reports
add column if not exists residence_type text;

alter table public.personal_lesson_reports
add column if not exists payment_method text;

-- =========================================
-- 4. 회원가입 신청 테이블
-- =========================================

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

-- =========================================
-- 5. 재무 테이블
-- =========================================

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),

  transaction_date date not null,

  type text not null,
  category text,

  amount integer not null,

  memo text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================
-- 6. RLS 활성화
-- =========================================

alter table public.members
enable row level security;

alter table public.lessons
enable row level security;

alter table public.personal_lesson_reports
enable row level security;

alter table public.signup_requests
enable row level security;

alter table public.transactions
enable row level security;

-- =========================================
-- 7. API 역할 권한 부여
-- =========================================

grant insert on public.signup_requests to anon;

grant select, insert, update, delete on public.members to authenticated;
grant select, insert, update, delete on public.lessons to authenticated;
grant select, insert, update, delete on public.personal_lesson_reports to authenticated;
grant select, insert, update, delete on public.signup_requests to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;

-- =========================================
-- 8. 로그인한 사용자만 접근 허용
-- =========================================

drop policy if exists "authenticated members access" on public.members;
drop policy if exists "authenticated lessons access" on public.lessons;
drop policy if exists "authenticated personal lesson reports access" on public.personal_lesson_reports;
drop policy if exists "authenticated signup requests access" on public.signup_requests;
drop policy if exists "authenticated transactions access" on public.transactions;

create policy "authenticated members access"
on public.members
for all
to authenticated
using (true)
with check (true);

create policy "authenticated lessons access"
on public.lessons
for all
to authenticated
using (true)
with check (true);

create policy "authenticated personal lesson reports access"
on public.personal_lesson_reports
for all
to authenticated
using (true)
with check (true);

create policy "authenticated signup requests access"
on public.signup_requests
for all
to authenticated
using (true)
with check (true);

create policy "authenticated transactions access"
on public.transactions
for all
to authenticated
using (true)
with check (true);

-- =========================================
-- 9. 회원가입 신청 저장 허용
-- =========================================

drop policy if exists "anon signup requests insert" on public.signup_requests;

create policy "anon signup requests insert"
on public.signup_requests
for insert
to anon
with check (true);


-- 관리자 로컬 도구에서 사용하는 서버 역할 권한
grant usage on schema public to service_role;
grant select, insert, update, delete on public.members, public.lessons, public.transactions, public.personal_lesson_reports, public.signup_requests to service_role;

notify pgrst, 'reload schema';
commit;
