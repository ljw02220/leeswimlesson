-- =========================================
-- 1. 회원 테이블
-- =========================================

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  phone text,

  lesson_format text,
  days text[],
  lesson_time time,

  total_lessons integer not null default 0,
  used_lessons integer not null default 0,

  payment_amount integer not null default 0,
  payment_date date,
  payment_status text not null default '확인필요',
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

  lesson_type text not null,
  status text not null default 'scheduled',

  source text not null default 'added',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

  reported_at date not null,
  memo text,

  created_at timestamptz not null default now()
);

-- =========================================
-- 4. 재무 테이블
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
-- 5. RLS 활성화
-- =========================================

alter table public.members
enable row level security;

alter table public.lessons
enable row level security;

alter table public.personal_lesson_reports
enable row level security;

alter table public.transactions
enable row level security;

-- =========================================
-- 6. API 역할 권한 부여
-- =========================================

grant select, insert, update, delete on public.members to anon;
grant select, insert, update, delete on public.lessons to anon;
grant select, insert, update, delete on public.personal_lesson_reports to anon;
grant select, insert, update, delete on public.transactions to anon;

grant select, insert, update, delete on public.members to authenticated;
grant select, insert, update, delete on public.lessons to authenticated;
grant select, insert, update, delete on public.personal_lesson_reports to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;

-- =========================================
-- 7. 로그인한 사용자만 접근 허용
-- =========================================

drop policy if exists "authenticated members access" on public.members;
drop policy if exists "authenticated lessons access" on public.lessons;
drop policy if exists "authenticated personal lesson reports access" on public.personal_lesson_reports;
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

create policy "authenticated transactions access"
on public.transactions
for all
to authenticated
using (true)
with check (true);

-- =========================================
-- 8. 개발 테스트용 익명 접근 허용
--    Supabase Auth 전환 후에는 아래 정책과 anon grant를 제거하세요.
-- =========================================

drop policy if exists "anon members access" on public.members;

create policy "anon members access"
on public.members
for all
to anon
using (true)
with check (true);

-- =========================================
-- 9. 초기 회원 데이터
--    이미 같은 이름/전화번호가 있으면 다시 넣지 않습니다.
-- =========================================

insert into public.members (
  name,
  phone,
  lesson_format,
  days,
  lesson_time,
  total_lessons,
  used_lessons,
  payment_amount,
  payment_date,
  payment_status,
  status,
  last_lesson_date,
  memo
)
select
  '김혜민',
  '010-2481-0912',
  '1:1',
  array['토'],
  '09:00',
  4,
  1,
  280000,
  '2026-09-08',
  '완납',
  '수강중',
  '2026-09-12',
  ''
where not exists (
  select 1 from public.members
  where name = '김혜민' and phone = '010-2481-0912'
);

insert into public.members (
  name,
  phone,
  lesson_format,
  days,
  lesson_time,
  total_lessons,
  used_lessons,
  payment_amount,
  payment_date,
  payment_status,
  status,
  last_lesson_date,
  memo
)
select
  '문지영',
  '010-5402-7718',
  '1:2',
  array['토'],
  '10:00',
  4,
  0,
  280000,
  null,
  '확인필요',
  '수강중',
  '2026-09-05',
  ''
where not exists (
  select 1 from public.members
  where name = '문지영' and phone = '010-5402-7718'
);

insert into public.members (
  name,
  phone,
  lesson_format,
  days,
  lesson_time,
  total_lessons,
  used_lessons,
  payment_amount,
  payment_date,
  payment_status,
  status,
  last_lesson_date,
  memo
)
select
  '전효원',
  '010-4429-0188',
  '1:2',
  array['토'],
  '10:00',
  4,
  0,
  280000,
  '2026-09-05',
  '완납',
  '수강중',
  '2026-09-05',
  ''
where not exists (
  select 1 from public.members
  where name = '전효원' and phone = '010-4429-0188'
);

insert into public.members (
  name,
  phone,
  lesson_format,
  days,
  lesson_time,
  total_lessons,
  used_lessons,
  payment_amount,
  payment_date,
  payment_status,
  status,
  last_lesson_date,
  memo
)
select
  '이은하',
  '010-9348-2210',
  '1:2',
  array['토'],
  '08:00',
  4,
  2,
  280000,
  null,
  '미납',
  '수강중',
  '2026-09-05',
  ''
where not exists (
  select 1 from public.members
  where name = '이은하' and phone = '010-9348-2210'
);
