-- 01~07 적용 후 실행. 기존 01010101010 계정을 유지하고 이름과 조회 권한만 변경합니다.
begin;
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
  if test_user_id is null then raise exception '01010101010 테스트 로그인 계정을 찾지 못했습니다.'; end if;
  select id into test_member_id from public.members
    where auth_user_id = test_user_id or regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = '01010101010'
    order by (auth_user_id = test_user_id) desc nulls last limit 1;
  if test_member_id is null then raise exception '테스트 회원 정보를 찾지 못했습니다.'; end if;
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
