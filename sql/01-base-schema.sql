-- 01 기본 DB 스키마 · 회원/수업/재무/권한/자유수영/테스트 조회
-- Supabase SQL Editor: 파일 전체를 실행하세요.
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

  status text not null default '수강중',

  last_lesson_date date,
  memo text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);





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



alter table public.signup_requests
enable row level security;

alter table public.transactions
enable row level security;


create or replace function public.is_swim_admin()
returns boolean language sql stable security definer set search_path = public, auth as $$
 select auth.uid() is not null and lower(coalesce(auth.jwt()->>'email','')) in ('ljw022072@gmail.com','admin@admins.leeswimlesson.com');
$$;
revoke all on function public.is_swim_admin() from public, anon;
grant execute on function public.is_swim_admin() to authenticated;

-- 승인된 가입 신청과 전화번호가 일치하는 기존 회원은 첫 로그인 때 본인 정보를 연결합니다.
create or replace function public.can_read_swim_member(p_member_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
 select auth.uid() is not null and exists (
  select 1 from public.members m where m.id = p_member_id and (
   m.auth_user_id = auth.uid() or (m.auth_user_id is null and exists (
    select 1 from public.signup_requests s where s.status = 'approved'
     and s.auth_user_id = auth.uid()
     and nullif(regexp_replace(s.phone,'[^0-9]','','g'),'') = nullif(regexp_replace(m.phone,'[^0-9]','','g'),'')
   ))
  )
 );
$$;
revoke all on function public.can_read_swim_member(uuid) from public, anon;
grant execute on function public.can_read_swim_member(uuid) to authenticated;

grant select, insert, update, delete on public.members, public.lessons, public.transactions, public.signup_requests to authenticated;
grant insert on public.signup_requests to anon;
grant usage on schema public to service_role;
grant select, insert, update, delete on public.members, public.lessons, public.transactions, public.signup_requests to service_role;

-- Delete only known legacy broad policies; preserve unrelated policies.
drop policy if exists "authenticated members access" on public.members;
drop policy if exists "authenticated lessons access" on public.lessons;
drop policy if exists "authenticated transactions access" on public.transactions;
drop policy if exists "authenticated signup requests access" on public.signup_requests;
drop policy if exists "swim members admin" on public.members;
create policy "swim members admin" on public.members for all to authenticated using(public.is_swim_admin()) with check(public.is_swim_admin());
drop policy if exists "swim members own read" on public.members;
create policy "swim members own read" on public.members for select to authenticated using(public.can_read_swim_member(id));
drop policy if exists "swim members own link" on public.members;
create policy "swim members own link" on public.members for update to authenticated using(auth_user_id is null and public.can_read_swim_member(id)) with check(auth_user_id = auth.uid());

-- Non-admin member edits are limited to linking an approved login account.
create or replace function public.guard_swim_member_link()
returns trigger language plpgsql set search_path = public, auth as $$
begin
 if auth.role() = 'authenticated' and not public.is_swim_admin() then
  if old.auth_user_id is not null or new.auth_user_id is distinct from auth.uid()
   or not public.can_read_swim_member(old.id)
   or (to_jsonb(new) - 'auth_user_id' - 'updated_at') is distinct from (to_jsonb(old) - 'auth_user_id' - 'updated_at') then
   raise exception '회원 정보는 관리자만 변경할 수 있습니다.';
  end if;
 end if;
 return new;
end;
$$;
drop trigger if exists guard_swim_member_link on public.members;
create trigger guard_swim_member_link before update on public.members for each row execute function public.guard_swim_member_link();
revoke all on function public.guard_swim_member_link() from public, anon, authenticated;

drop policy if exists "swim lessons admin" on public.lessons;
create policy "swim lessons admin" on public.lessons for all to authenticated using(public.is_swim_admin()) with check(public.is_swim_admin());
drop policy if exists "swim lessons member read" on public.lessons;
create policy "swim lessons member read" on public.lessons for select to authenticated using(
 public.can_read_swim_member(member_id) or (lesson_type = 'group' and exists(select 1 from public.members m where m.auth_user_id = auth.uid()))
 or exists(select 1 from public.members m where m.auth_user_id = auth.uid() and m.name = any(regexp_split_to_array(coalesce(title,''),'\s*,\s*')))
);
drop policy if exists "swim transactions admin" on public.transactions;
create policy "swim transactions admin" on public.transactions for all to authenticated using(public.is_swim_admin()) with check(public.is_swim_admin());
drop policy if exists "swim signup admin" on public.signup_requests;
create policy "swim signup admin" on public.signup_requests for all to authenticated using(public.is_swim_admin()) with check(public.is_swim_admin());
drop policy if exists "swim signup own read" on public.signup_requests;
create policy "swim signup own read" on public.signup_requests for select to authenticated using(auth_user_id = auth.uid() or lower(login_email) = lower(auth.jwt()->>'email'));
drop policy if exists "swim signup own insert" on public.signup_requests;
create policy "swim signup own insert" on public.signup_requests for insert to authenticated with check(auth_user_id = auth.uid() and status = 'pending');
drop policy if exists "anon signup requests insert" on public.signup_requests;
create policy "anon signup requests insert" on public.signup_requests for insert to anon with check(status = 'pending');

-- 자유수영: 수업/결제 횟수와 별도 저장
create table if not exists public.member_free_swims (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  swim_date date not null,
  created_at timestamptz not null default now(),
  unique (member_id, swim_date)
);
alter table public.member_free_swims enable row level security;
revoke all on public.member_free_swims from anon, authenticated;
grant select, insert, delete on public.member_free_swims to authenticated;
drop policy if exists "own free swim select" on public.member_free_swims;
create policy "own free swim select" on public.member_free_swims for select to authenticated
using (exists (select 1 from public.members m where m.id = member_id and m.auth_user_id = auth.uid()));
drop policy if exists "own free swim insert" on public.member_free_swims;
create policy "own free swim insert" on public.member_free_swims for insert to authenticated
with check (swim_date <= (now() at time zone 'Asia/Seoul')::date
  and exists (select 1 from public.members m where m.id = member_id and m.auth_user_id = auth.uid()));
drop policy if exists "own free swim delete" on public.member_free_swims;
create policy "own free swim delete" on public.member_free_swims for delete to authenticated
using (exists (select 1 from public.members m where m.id = member_id and m.auth_user_id = auth.uid()));
-- 테스트 계정은 기존 Auth UUID에만 조회 권한을 등록합니다.
create table if not exists public.test_account_access (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.test_account_access enable row level security;
revoke all on public.test_account_access from public, anon, authenticated;

do $$
declare test_user_id uuid; test_member_id uuid;
begin
  select id into test_user_id from auth.users where email = '01010101010@members.leeswimlesson.com';
  if test_user_id is null then raise notice '기존 테스트 계정이 없어 이름/권한 등록을 건너뜁니다.'; return; end if;
  select id into test_member_id from public.members
    where auth_user_id = test_user_id or regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = '01010101010'
    order by (auth_user_id = test_user_id) desc nulls last limit 1;
  if test_member_id is null then raise notice '테스트 회원 정보가 없어 이름/권한 등록을 건너뜁니다.'; return; end if;
  update public.members set name = '테스트', auth_user_id = test_user_id, updated_at = now() where id = test_member_id;
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"name":"테스트","display_name":"테스트"}'::jsonb where id = test_user_id;
  insert into public.test_account_access(auth_user_id) values(test_user_id) on conflict do nothing;
end;
$$;

create or replace function public.can_view_test_members()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select auth.uid() is not null and (
    exists(select 1 from public.test_account_access where auth_user_id = auth.uid())
    or lower(coalesce(auth.jwt()->>'email','')) in ('ljw022072@gmail.com','admin@admins.leeswimlesson.com')
  );
$$;

create or replace function public.get_test_member_overview(p_member_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare selected_member uuid; result jsonb;
begin
  if not public.can_view_test_members() then raise exception '테스트 계정의 전체 회원 조회 권한이 없습니다.'; end if;
  selected_member := p_member_id;
  if selected_member is null then
    select id into selected_member from public.members where auth_user_id = auth.uid() limit 1;
  end if;
  if not exists(select 1 from public.members where id = selected_member) then raise exception '회원을 찾지 못했습니다.'; end if;
  select jsonb_build_object(
    'members', (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name,id),'[]'::jsonb) from public.members),
    'member', (select to_jsonb(m) from public.members m where id = selected_member),
    'lessons', (select coalesce(jsonb_agg(to_jsonb(l) order by l.lesson_date desc,l.lesson_time),'[]'::jsonb) from public.lessons l where l.member_id = selected_member or l.lesson_type = 'group' or exists(select 1 from public.members m where m.id = selected_member and m.name = any(regexp_split_to_array(coalesce(l.title,''),'\s*,\s*')))),
    'comments', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at),'[]'::jsonb) from public.lesson_comments c where exists(select 1 from public.lessons l where l.lesson_type = c.lesson_type and l.lesson_date = c.lesson_date and l.lesson_time = c.lesson_time and (l.member_id = selected_member or l.lesson_type = 'group' or exists(select 1 from public.members m where m.id = selected_member and m.name = any(regexp_split_to_array(coalesce(l.title,''),'\s*,\s*')))))),
    'payments', (select coalesce(jsonb_agg(to_jsonb(p) order by p.payment_date desc),'[]'::jsonb) from public.payment_requests p where p.member_id = selected_member),
    'reports', (select coalesce(jsonb_agg(to_jsonb(r) order by r.reported_at desc),'[]'::jsonb) from public.personal_lesson_reports r where r.member_id = selected_member),
    'freeSwims', (select coalesce(jsonb_agg(to_jsonb(f) order by f.swim_date desc),'[]'::jsonb) from public.member_free_swims f where f.member_id = selected_member)
  ) into result;
  return result;
end;
$$;
revoke all on function public.can_view_test_members() from public, anon;
revoke all on function public.get_test_member_overview(uuid) from public, anon;
grant execute on function public.can_view_test_members() to authenticated;
grant execute on function public.get_test_member_overview(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
