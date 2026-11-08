-- 04 휴대폰 푸시 알림 · 입금 관련 SQL 제외
-- Supabase SQL Editor에서 파일 전체를 실행하세요.
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
  comment_author text := coalesce(new.author_name, '회원');
begin
  perform public.queue_admin_push(
    '새 수업 댓글',
    comment_author || '님이 댓글을 남겼습니다.',
    './members.html',
    'comment-' || new.id::text
  );

  for target_member in
    select distinct member.id
    from public.members member
    where member.auth_user_id is not null
      and member.id is distinct from new.author_member_id
      and (
        (new.lesson_type in ('personal', 'makeup') and exists (
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
      './member-lessons.html?view=completed',
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
      './member-lessons.html?view=completed',
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

notify pgrst, 'reload schema';
commit;
