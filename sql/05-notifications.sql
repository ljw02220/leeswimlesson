-- 05 알림 · 가입/보강/댓글/수업노트 푸시 연결
-- Supabase SQL Editor: 파일 전체를 실행하세요.
begin;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
-- Edge Function uses service_role; RLS bypass does not grant table privileges.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.push_subscriptions to service_role;

drop policy if exists "users manage own push subscriptions" on public.push_subscriptions;
create policy "users manage own push subscriptions"
on public.push_subscriptions
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create table if not exists public.push_notification_events (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid,
  target_role text check (target_role in ('admin', 'member')),
  title text not null,
  body text not null,
  url text not null default './member-home.html',
  tag text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.push_notification_events enable row level security;
revoke all on public.push_notification_events from anon, authenticated;
grant select, update on public.push_notification_events to service_role;

create or replace function public.queue_admin_push(
  p_title text,
  p_body text,
  p_url text default './home.html',
  p_tag text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.push_notification_events (target_user_id, target_role, title, body, url, tag)
  select id, 'admin', p_title, p_body, p_url, p_tag
  from auth.users
  where lower(email) in ('ljw022072@gmail.com', 'admin@admins.leeswimlesson.com');
end;
$$;

create or replace function public.queue_member_push(
  p_member_id uuid,
  p_title text,
  p_body text,
  p_url text default './member-home.html',
  p_tag text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.push_notification_events (target_user_id, target_role, title, body, url, tag)
  select auth_user_id, 'member', p_title, p_body, p_url, p_tag
  from public.members
  where id = p_member_id and auth_user_id is not null;
end;
$$;

create or replace function public.notify_signup_request_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.queue_admin_push(
    '새 회원가입 신청',
    new.name || '님의 가입 승인이 필요합니다.',
    './members.html',
    'signup-' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists notify_signup_request_push on public.signup_requests;
create trigger notify_signup_request_push
after insert on public.signup_requests
for each row execute function public.notify_signup_request_push();

create or replace function public.notify_makeup_request_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_name text;
begin
  select name into member_name from public.members where id = new.member_id;
  if tg_op = 'INSERT' then
    perform public.queue_admin_push(
      '새 보강 신청',
      coalesce(member_name, '회원') || '님의 보강 신청을 확인해주세요.',
      './lessons.html',
      'makeup-' || new.id::text
    );
  elsif new.status is distinct from old.status and new.status in ('approved', 'rejected', 'cancelled') then
    perform public.queue_member_push(
      new.member_id,
      case new.status when 'approved' then '보강 신청 승인' when 'rejected' then '보강 신청 반려' else '보강 신청 취소' end,
      '보강 신청 결과를 확인해주세요.',
      './member-home.html',
      'makeup-' || new.id::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_makeup_request_push on public.makeup_requests;
create trigger notify_makeup_request_push
after insert or update of status on public.makeup_requests
for each row execute function public.notify_makeup_request_push();

create or replace function public.notify_lesson_comment_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_member record;
  comment_author text;
  target_lesson_id uuid;
begin
  select coalesce(new.author_name, m.name, '회원') into comment_author from (select 1) seed left join public.members m on m.id = new.author_member_id;
  select id into target_lesson_id from public.lessons where lesson_type = new.lesson_type and lesson_date = new.lesson_date and lesson_time = new.lesson_time order by created_at,id limit 1;
  perform public.queue_admin_push(
    '새 수업 댓글',
    comment_author || '님이 댓글을 남겼습니다.',
    './home.html?date=' || new.lesson_date::text,
    'comment-' || new.id::text
  );

  for target_member in
    select distinct member.id
    from public.members member
    where member.auth_user_id is not null
      and member.id is distinct from new.author_member_id
      and (
        (new.lesson_type = 'personal' and member.lesson_time = new.lesson_time
          and (array['일','월','화','수','목','금','토'])[extract(dow from new.lesson_date)::integer+1] = any(member.days)
          and member.total_lessons > 0)
        or (new.lesson_type = 'makeup' and exists(select 1 from public.makeup_requests r join public.makeup_slots s on s.id=r.slot_id where r.member_id=member.id and r.status='approved' and s.slot_date=new.lesson_date and s.slot_time=new.lesson_time))
        or (new.lesson_type in ('personal', 'makeup') and exists (
          select 1 from public.lessons lesson
          where lesson.member_id = member.id
            and lesson.lesson_type = new.lesson_type
            and lesson.lesson_date = new.lesson_date
            and lesson.lesson_time = new.lesson_time
        ))
        or
        (new.lesson_type = 'group' and exists (
          select 1
          from jsonb_array_elements(coalesce(member.group_lessons, '[]'::jsonb)) item
          where (item ->> 'day')::integer = extract(dow from new.lesson_date)::integer
            and left(item ->> 'time', 5) = to_char(new.lesson_time, 'HH24:MI')
        ))
      )
  loop
    perform public.queue_member_push(
      target_member.id,
      '새 수업 댓글',
      comment_author || '님이 함께 들은 수업에 댓글을 남겼습니다.',
      './member-home.html?date=' || new.lesson_date::text,
      'comment-' || new.id::text
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists notify_lesson_comment_push on public.lesson_comments;
create trigger notify_lesson_comment_push
after insert on public.lesson_comments
for each row execute function public.notify_lesson_comment_push();

create or replace function public.notify_lesson_note_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_member record;
begin
  if nullif(trim(coalesce(new.memo, '')), '') is null
     or new.memo is not distinct from old.memo then
    return new;
  end if;

  for target_member in
    select distinct member.id
    from public.members member
    where member.auth_user_id is not null
      and (
        (new.lesson_type in ('personal', 'makeup') and member.id = new.member_id)
        or
        (new.lesson_type = 'group' and exists (
          select 1
          from jsonb_array_elements(coalesce(member.group_lessons, '[]'::jsonb)) item
          where (item ->> 'day')::integer = extract(dow from new.lesson_date)::integer
            and left(item ->> 'time', 5) = to_char(new.lesson_time, 'HH24:MI')
        ))
      )
  loop
    perform public.queue_member_push(
      target_member.id,
      '새 수업노트',
      to_char(new.lesson_date, 'YYYY-MM-DD') || ' 수업 내용이 작성되었습니다.',
      './member-home.html?date=' || new.lesson_date::text,
      'note-' || new.id::text
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists notify_lesson_note_push on public.lessons;
create trigger notify_lesson_note_push
after update of memo on public.lessons
for each row execute function public.notify_lesson_note_push();
revoke all on function public.queue_admin_push(text,text,text,text) from public, anon, authenticated;

revoke all on function public.queue_member_push(uuid,text,text,text,text) from public, anon, authenticated;

revoke all on function public.notify_signup_request_push() from public, anon, authenticated;

revoke all on function public.notify_makeup_request_push() from public, anon, authenticated;

revoke all on function public.notify_lesson_comment_push() from public, anon, authenticated;

revoke all on function public.notify_lesson_note_push() from public, anon, authenticated;

create or replace function public.notify_personal_lesson_move_push()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' and (old.new_date,old.new_time) is not distinct from (new.new_date,new.new_time) then return new; end if;
 perform public.queue_member_push(new.member_id,'개인레슨 일정 변경',to_char(new.new_date,'YYYY-MM-DD') || ' ' || to_char(new.new_time,'HH24:MI') || ' 수업으로 변경되었습니다.','./member-home.html?date=' || new.new_date::text,'lesson-move-' || new.id::text);
 return new;
end;
$$;
drop trigger if exists notify_personal_lesson_move_push on public.personal_lesson_moves;
create trigger notify_personal_lesson_move_push after insert or update of new_date,new_time on public.personal_lesson_moves for each row execute function public.notify_personal_lesson_move_push();
revoke all on function public.notify_personal_lesson_move_push() from public,anon,authenticated;

-- 공통 운동량 대상: 등록된 단체수업 또는 승인된 보강. 개인레슨은 제외합니다.
create or replace function public.workout_recipient_ids(p_date date)
returns table(member_id uuid) language sql stable security definer set search_path=public as $$
 select m.id from public.members m where m.auth_user_id is not null and (
 exists(select 1 from jsonb_array_elements(coalesce(m.group_lessons,'[]'::jsonb)) g where (g->>'day')::integer=extract(dow from p_date)::integer)
 or exists(select 1 from public.makeup_requests r join public.makeup_slots s on s.id=r.slot_id where r.member_id=m.id and r.status='approved' and s.slot_date=p_date)
 );
$$;
revoke all on function public.workout_recipient_ids(date) from public,anon,authenticated;
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
revoke all on function public.notify_daily_workout_push() from public,anon,authenticated;
drop trigger if exists notify_daily_workout_push on public.daily_workouts;
create trigger notify_daily_workout_push after insert or update of workout_plan on public.daily_workouts for each row execute function public.notify_daily_workout_push();
create or replace function public.get_workout_notifications()
returns table(workout_date date,updated_at timestamptz) language sql stable security definer set search_path=public as $$
 select w.workout_date,w.updated_at from public.daily_workouts w
 where w.workout_plan is not null and jsonb_array_length(coalesce(w.workout_plan->'rows','[]'::jsonb))>0
 and exists(select 1 from public.workout_recipient_ids(w.workout_date) r join public.members m on m.id=r.member_id where m.auth_user_id=auth.uid())
 order by w.updated_at desc limit 20;
$$;
revoke all on function public.get_workout_notifications() from public,anon;
grant execute on function public.get_workout_notifications() to authenticated;
-- 실제 발송 경로를 사용하는 본인 테스트. 30초 간격 제한.
create or replace function public.send_my_test_push()
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 if not exists(select 1 from public.push_subscriptions where user_id=auth.uid()) then raise exception '먼저 이 기기의 휴대폰 알림을 켜주세요.'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 if exists(select 1 from public.push_notification_events where target_user_id=auth.uid() and tag='self-test' and created_at>now()-interval '30 seconds') then raise exception '테스트는 30초 후에 다시 해주세요.'; end if;
 insert into public.push_notification_events(target_user_id,target_role,title,body,url,tag)
 values(auth.uid(),case when public.is_swim_admin() then 'admin' else 'member' end,'수영관리 테스트 알림','휴대폰 알림이 연결됐어요.',case when public.is_swim_admin() then './home.html' else './member-home.html' end,'self-test');
end;
$$;
revoke all on function public.send_my_test_push() from public,anon;
grant execute on function public.send_my_test_push() to authenticated;

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
