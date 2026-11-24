-- 회원 본인의 자유수영 기록. 01번 기본 DB 설정 후 실행하세요.
begin;
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
notify pgrst, 'reload schema';
commit;
