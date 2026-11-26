-- 기존 01~05 적용 후 실행하는 추가 SQL. 회원/계정/기존 내역은 삭제하지 않습니다.
begin;
create or replace function public.has_personal_lessons(p_member_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.members m where m.id=p_member_id
 and coalesce(m.lesson_format,'') !~* '(단체|group)'
 and (coalesce(m.lesson_format,'') ~ '^1[[:space:]]*:[[:space:]]*[0-9]+' or m.total_lessons>0));
$$;
revoke all on function public.has_personal_lessons(uuid) from public,anon;
grant execute on function public.has_personal_lessons(uuid) to authenticated;
drop policy if exists "members create own makeup requests" on public.makeup_requests;
create policy "members create own makeup requests"
on public.makeup_requests
for insert to authenticated
with check (public.is_swim_admin());
drop policy if exists "members request makeup credits" on public.makeup_credits;
create policy "members request makeup credits"
on public.makeup_credits
for insert to authenticated
with check (public.is_swim_admin());
create or replace function public.cancel_makeup_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_request public.makeup_requests%rowtype;
  is_admin boolean;
  is_owner boolean;
begin
  select * into target_request
  from public.makeup_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception '보강 신청을 찾을 수 없습니다.';
  end if;

  is_admin := public.is_swim_admin();
  select exists (
    select 1 from public.members
    where members.id = target_request.member_id
      and members.auth_user_id = auth.uid()
  ) into is_owner;

  if not is_admin then
    raise exception '보강 신청을 취소할 권한이 없습니다.';
  end if;

  if target_request.status not in ('pending', 'approved') then
    raise exception '이미 처리된 보강 신청입니다.';
  end if;

  update public.makeup_requests
  set status = 'cancelled', reviewed_at = now()
  where id = p_request_id;

  update public.makeup_slots
  set status = 'open'
  where id = target_request.slot_id;
end;
$$;
revoke all on function public.cancel_makeup_request(uuid) from public,anon;
grant execute on function public.cancel_makeup_request(uuid) to authenticated;
create or replace function public.cancel_makeup_credit(p_credit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_credit public.makeup_credits%rowtype;
  is_admin boolean;
  is_owner boolean;
begin
  select * into target_credit
  from public.makeup_credits
  where id = p_credit_id
  for update;

  if not found then
    raise exception '보강 확인 요청을 찾을 수 없습니다.';
  end if;

  is_admin := lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'ljw022072@gmail.com',
    'admin@admins.leeswimlesson.com'
  );
  select exists (
    select 1 from public.members member
    where member.id = target_credit.member_id
      and member.auth_user_id = auth.uid()
  ) into is_owner;

  if not is_admin then
    raise exception '보강 확인 요청을 취소할 권한이 없습니다.';
  end if;

  if (not is_admin and target_credit.status <> 'pending')
     or (is_admin and target_credit.status not in ('pending', 'approved')) then
    raise exception '취소할 수 없는 보강 확인 요청입니다.';
  end if;

  if target_credit.status = 'approved'
     and target_credit.remaining_quantity <> target_credit.quantity then
    raise exception '사용 내역을 먼저 되돌린 후 승인을 취소해주세요.';
  end if;

  update public.makeup_credits
  set status = 'cancelled', updated_at = now()
  where id = p_credit_id;
end;
$$;
revoke all on function public.cancel_makeup_credit(uuid) from public,anon;
grant execute on function public.cancel_makeup_credit(uuid) to authenticated;
create or replace function public.request_member_payment(p_member_id uuid, p_payment_date date, p_payment_amount integer)
returns uuid language plpgsql security definer set search_path = public
as $$
declare request_id uuid;
begin
  perform 1 from public.members where id = p_member_id and auth_user_id = auth.uid() for update;
  if not found then raise exception '본인의 입금만 알릴 수 있습니다.'; end if;
  if not public.has_personal_lessons(p_member_id) then raise exception '결제 알리기는 개인레슨 회원만 이용할 수 있습니다.'; end if;
  if p_payment_date is null or p_payment_amount is null or p_payment_amount <= 0 then
    raise exception '입금일과 금액을 확인해주세요.';
  end if;
  if exists (select 1 from public.payment_requests where member_id = p_member_id and status = 'pending') then
    raise exception '이미 확인 대기 중인 입금 알림이 있습니다.';
  end if;
  insert into public.payment_requests(member_id, payment_date, payment_amount)
  values (p_member_id, p_payment_date, p_payment_amount) returning id into request_id;
  return request_id;
end;
$$;
revoke all on function public.request_member_payment(uuid,date,integer) from public,anon;
grant execute on function public.request_member_payment(uuid,date,integer) to authenticated;
create or replace function public.get_test_member_overview(p_member_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare selected_member uuid; result jsonb;
begin
  if not public.can_view_test_members() then raise exception '테스트 계정의 전체 회원 조회 권한이 없습니다.'; end if;
  selected_member := p_member_id;
  if selected_member is null then
    select id into selected_member from public.members where auth_user_id = auth.uid() limit 1;
  end if;
  if selected_member is null and public.is_swim_admin() then select id into selected_member from public.members order by name,id limit 1; end if;
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
revoke all on function public.get_test_member_overview(uuid) from public,anon;
grant execute on function public.get_test_member_overview(uuid) to authenticated;
create or replace function public.notify_daily_workout_push()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient record;
begin
 if new.workout_plan is null or jsonb_array_length(coalesce(new.workout_plan->'rows','[]'::jsonb))=0 then return new; end if;
 if tg_op='UPDATE' then if new.workout_plan is not distinct from old.workout_plan then return new; end if; end if;
 perform public.queue_admin_push('수업 운동량이 올라왔어요',new.workout_date::text || ' 운동량을 확인해주세요.','./home.html?date='||new.workout_date::text,'workout-'||new.workout_date::text);
 for recipient in select member_id from public.workout_recipient_ids(new.workout_date) loop
 perform public.queue_member_push(recipient.member_id,'수업 운동량이 올라왔어요',new.workout_date::text || ' 운동량을 확인해주세요.','./member-home.html?date='||new.workout_date::text,'workout-'||new.workout_date::text);
 end loop;
 return new;
end;
$$;
-- 관리자에게 회원 발송 소식도 모읍니다. 동일 묶음 소식은 한 번만 복사합니다.
create or replace function public.mirror_member_push_to_admin()
returns trigger language plpgsql security definer set search_path=public,auth as $$
declare admin_user record;
begin
 if new.target_role is distinct from 'member' or new.tag in ('self-test') then return new; end if;
 for admin_user in select id from auth.users where lower(email) in ('ljw022072@gmail.com','admin@admins.leeswimlesson.com') loop
  if admin_user.id=new.target_user_id then continue; end if;
  perform pg_advisory_xact_lock(hashtext(admin_user.id::text||coalesce(new.tag,new.id::text)));
  if not exists(select 1 from public.push_notification_events e where e.target_user_id=admin_user.id and e.target_role='admin' and e.tag=coalesce(new.tag,new.id::text) and e.created_at>=new.created_at-interval '5 seconds') then
   insert into public.push_notification_events(target_user_id,target_role,title,body,url,tag)
   values(admin_user.id,'admin',new.title,new.body,
    case when new.url like '%member-home.html?date=%' then replace(new.url,'member-home.html','home.html')
     when new.url like '%makeup%' then './lessons.html'
     when new.tag like 'payment-%' then './finance.html#paymentRequests'
     else './test-members.html' end,coalesce(new.tag,new.id::text));
  end if;
 end loop;
 return new;
end;
$$;
revoke all on function public.mirror_member_push_to_admin() from public,anon,authenticated;
drop trigger if exists mirror_member_push_to_admin on public.push_notification_events;
create trigger mirror_member_push_to_admin after insert on public.push_notification_events for each row execute function public.mirror_member_push_to_admin();
create or replace function public.get_admin_push_inbox()
returns table(id uuid,title text,body text,url text,tag text,created_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.is_swim_admin() then raise exception '관리자만 전체 알림을 볼 수 있습니다.'; end if;
 return query select e.id,e.title,e.body,e.url,e.tag,e.created_at from public.push_notification_events e
 where e.target_user_id=auth.uid() and e.target_role='admin' order by e.created_at desc limit 60;
end;
$$;
revoke all on function public.get_admin_push_inbox() from public,anon;
grant execute on function public.get_admin_push_inbox() to authenticated;

notify pgrst, 'reload schema';
commit;
