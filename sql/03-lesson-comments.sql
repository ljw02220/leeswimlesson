-- 03 수업 댓글 · 기본 댓글/대댓글/삭제/수업노트 조회
-- Supabase SQL Editor: 파일 전체를 실행하세요.
begin;

create table if not exists public.lesson_comments (
  id uuid primary key default gen_random_uuid(),
  lesson_type text not null,
  lesson_date date not null,
  lesson_time time not null,
  author_member_id uuid references public.members(id) on delete cascade,
  author_role text not null default 'member' check (author_role in ('member', 'admin')),
  author_name text,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.lesson_comments
alter column author_member_id drop not null;

alter table public.lesson_comments
add column if not exists author_role text not null default 'member';

alter table public.lesson_comments
add column if not exists author_name text;

-- 기존 댓글 이름은 조회 함수에서 회원명으로 보완합니다.

create index if not exists lesson_comments_thread_idx
on public.lesson_comments (lesson_type, lesson_date, lesson_time, created_at);

alter table public.lesson_comments enable row level security;

alter table public.lessons
add column if not exists note_updated_at timestamptz;

create or replace function public.track_lesson_note_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if nullif(trim(coalesce(new.memo, '')), '') is not null then
      new.note_updated_at := now();
    end if;
  elsif new.memo is distinct from old.memo then
    if nullif(trim(coalesce(new.memo, '')), '') is not null then
      new.note_updated_at := now();
    else
      new.note_updated_at := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists track_lesson_note_update on public.lessons;

create trigger track_lesson_note_update
before insert or update of memo on public.lessons
for each row
execute function public.track_lesson_note_update();

-- 기존 수업노트 날짜는 변경하지 않습니다.

create or replace function public.can_access_lesson_comments(p_lesson_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_lesson public.lessons%rowtype;
begin
  select * into target_lesson
  from public.lessons
  where id = p_lesson_id;

  if not found then return false; end if;

  if lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'ljw022072@gmail.com',
    'admin@admins.leeswimlesson.com'
  ) then
    return true;
  end if;

  if not exists (
    select 1
    from public.members member
    where member.auth_user_id = auth.uid()
  ) then
    return false;
  end if;

  if target_lesson.lesson_type = 'personal' then
    return exists (
      select 1
      from public.lessons lesson
      join public.members member on member.id = lesson.member_id
      where member.auth_user_id = auth.uid()
        and lesson.lesson_type = target_lesson.lesson_type
        and lesson.lesson_date = target_lesson.lesson_date
        and lesson.lesson_time = target_lesson.lesson_time
        and lesson.status = 'completed'
    ) or exists (
      select 1
      from public.members member
      where member.auth_user_id = auth.uid()
        and member.name = any(
          regexp_split_to_array(coalesce(target_lesson.title, ''), '\s*,\s*')
        )
    );
  end if;

  if target_lesson.lesson_type = 'makeup' then
    return exists (
      select 1
      from public.lessons lesson
      join public.members member on member.id = lesson.member_id
      where member.auth_user_id = auth.uid()
        and lesson.lesson_type = 'makeup'
        and lesson.lesson_date = target_lesson.lesson_date
        and lesson.lesson_time = target_lesson.lesson_time
        and lesson.status = 'completed'
    );
  end if;

  if target_lesson.lesson_type = 'group' then
    return exists (
      select 1
      from public.members member
      cross join lateral jsonb_array_elements(
        coalesce(member.group_lessons, '[]'::jsonb)
      ) item
      where case
          when item ->> 'day' ~ '^[0-6]$' then (item ->> 'day')::integer
          when coalesce(item ->> 'dayName', item ->> 'day') = '일' then 0
          when coalesce(item ->> 'dayName', item ->> 'day') = '월' then 1
          when coalesce(item ->> 'dayName', item ->> 'day') = '화' then 2
          when coalesce(item ->> 'dayName', item ->> 'day') = '수' then 3
          when coalesce(item ->> 'dayName', item ->> 'day') = '목' then 4
          when coalesce(item ->> 'dayName', item ->> 'day') = '금' then 5
          when coalesce(item ->> 'dayName', item ->> 'day') = '토' then 6
          else -1
        end = extract(dow from target_lesson.lesson_date)::integer
        and left(item ->> 'time', 5) = to_char(target_lesson.lesson_time, 'HH24:MI')
        and member.auth_user_id = auth.uid()
    );
  end if;

  return false;
end;
$$;

create or replace function public.get_lesson_comments(p_lesson_id uuid)
returns table (
  id uuid,
  author_name text,
  body text,
  created_at timestamptz,
  is_mine boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_lesson public.lessons%rowtype;
  current_member_id uuid;
  is_admin boolean;
begin
  if not public.can_access_lesson_comments(p_lesson_id) then
    raise exception '이 수업의 댓글을 볼 권한이 없습니다.';
  end if;

  select * into target_lesson from public.lessons where lessons.id = p_lesson_id;
  select members.id into current_member_id
  from public.members
  where auth_user_id = auth.uid()
  limit 1;

  is_admin := lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'ljw022072@gmail.com',
    'admin@admins.leeswimlesson.com'
  );

  return query
  select
    comment.id,
    coalesce(comment.author_name, member.name, '회원'),
    comment.body,
    comment.created_at,
    is_admin or comment.author_member_id = current_member_id
  from public.lesson_comments comment
  left join public.members member on member.id = comment.author_member_id
  where comment.lesson_type = target_lesson.lesson_type
    and comment.lesson_date = target_lesson.lesson_date
    and comment.lesson_time = target_lesson.lesson_time
  order by comment.created_at asc;
end;
$$;

create or replace function public.add_lesson_comment(
  p_lesson_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_lesson public.lessons%rowtype;
  current_member_id uuid;
  new_comment_id uuid;
  is_admin boolean;
begin
  if not public.can_access_lesson_comments(p_lesson_id) then
    raise exception '이 수업에 댓글을 작성할 권한이 없습니다.';
  end if;

  if char_length(trim(coalesce(p_body, ''))) not between 1 and 500 then
    raise exception '댓글은 1자 이상 500자 이하로 입력해주세요.';
  end if;

  select * into target_lesson from public.lessons where lessons.id = p_lesson_id;
  select members.id into current_member_id
  from public.members
  where auth_user_id = auth.uid()
  limit 1;

  is_admin := lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'ljw022072@gmail.com',
    'admin@admins.leeswimlesson.com'
  );

  if current_member_id is null and not is_admin then
    raise exception '회원 정보를 찾을 수 없습니다.';
  end if;

  insert into public.lesson_comments (
    lesson_type,
    lesson_date,
    lesson_time,
    author_member_id,
    author_role,
    author_name,
    body
  ) values (
    target_lesson.lesson_type,
    target_lesson.lesson_date,
    target_lesson.lesson_time,
    current_member_id,
    case when is_admin then 'admin' else 'member' end,
    case when is_admin then '이정우' else null end,
    trim(p_body)
  )
  returning id into new_comment_id;

  return new_comment_id;
end;
$$;



create or replace function public.get_lesson_comment_notifications()
returns table (
  id uuid,
  lesson_id uuid,
  lesson_type text,
  lesson_date date,
  lesson_time time,
  author_name text,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_member_id uuid;
  is_admin boolean;
begin
  select members.id into current_member_id
  from public.members
  where auth_user_id = auth.uid()
  limit 1;

  is_admin := lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'ljw022072@gmail.com',
    'admin@admins.leeswimlesson.com'
  );

  return query
  select
    comment.id,
    accessible_lesson.id,
    comment.lesson_type,
    comment.lesson_date,
    comment.lesson_time,
    coalesce(comment.author_name, member.name, '회원'),
    comment.body,
    comment.created_at
  from public.lesson_comments comment
  left join public.members member on member.id = comment.author_member_id
  left join lateral (
    select lesson.id
    from public.lessons lesson
    where lesson.lesson_type = comment.lesson_type
      and lesson.lesson_date = comment.lesson_date
      and lesson.lesson_time = comment.lesson_time
      and public.can_access_lesson_comments(lesson.id)
    order by lesson.created_at asc
    limit 1
  ) accessible_lesson on true
  where public.can_access_member_lesson_slot(comment.lesson_type,comment.lesson_date,comment.lesson_time) and comment.deleted_at is null and (
    (is_admin and comment.author_role <> 'admin')
    or (
      not is_admin
      and current_member_id is not null
      and comment.author_member_id is distinct from current_member_id
    )
  )
  order by comment.created_at desc
  limit 20;
end;
$$;

create or replace function public.get_lesson_note_notifications()
returns table (
  id uuid,
  lesson_type text,
  lesson_date date,
  lesson_time time,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
begin
  is_admin := lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'ljw022072@gmail.com',
    'admin@admins.leeswimlesson.com'
  );

  if is_admin then
    return;
  end if;

  return query
  select
    note.id,
    note.lesson_type,
    note.lesson_date,
    note.lesson_time,
    note.body,
    note.created_at
  from (
    select distinct on (
      lesson.lesson_type,
      lesson.lesson_date,
      lesson.lesson_time
    )
      lesson.id,
      lesson.lesson_type,
      lesson.lesson_date,
      lesson.lesson_time,
      lesson.memo as body,
      lesson.note_updated_at as created_at
    from public.lessons lesson
    where lesson.note_updated_at is not null
      and nullif(trim(coalesce(lesson.memo, '')), '') is not null
      and public.can_access_lesson_comments(lesson.id)
    order by
      lesson.lesson_type,
      lesson.lesson_date,
      lesson.lesson_time,
      lesson.note_updated_at desc
  ) note
  order by note.created_at desc
  limit 20;
end;
$$;












alter table public.lesson_comments
  add column if not exists parent_comment_id uuid references public.lesson_comments(id),
  add column if not exists deleted_at timestamptz;
create index if not exists lesson_comments_parent_idx on public.lesson_comments(parent_comment_id);

create or replace function public.get_lesson_comment_threads(p_lesson_id uuid)
returns table(id uuid, author_name text, body text, created_at timestamptz,
  is_mine boolean, parent_comment_id uuid, is_deleted boolean)
language sql security definer set search_path = public as $$
  select c.id, c.author_name, c.body, c.created_at, c.is_mine,
    stored.parent_comment_id, stored.deleted_at is not null
  from public.get_lesson_comments(p_lesson_id) c
  join public.lesson_comments stored on stored.id = c.id
  order by c.created_at, c.id;
$$;

create or replace function public.add_lesson_reply(p_lesson_id uuid, p_body text, p_parent_comment_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  target_lesson public.lessons%rowtype;
  parent public.lesson_comments%rowtype;
  reply_id uuid;
begin
  if not public.can_access_lesson_comments(p_lesson_id) then
    raise exception '이 수업에 답글을 작성할 권한이 없습니다.';
  end if;
  select * into target_lesson from public.lessons where id = p_lesson_id;
  select * into parent from public.lesson_comments where id = p_parent_comment_id for update;
  if not found or parent.deleted_at is not null then
    raise exception '답글을 남길 댓글을 찾을 수 없습니다.';
  end if;
  if parent.lesson_type is distinct from target_lesson.lesson_type
    or parent.lesson_date is distinct from target_lesson.lesson_date
    or parent.lesson_time is distinct from target_lesson.lesson_time then
    raise exception '같은 수업의 댓글에만 답글을 작성할 수 있습니다.';
  end if;
  if parent.parent_comment_id is not null then
    raise exception '원래 댓글에 답글을 작성해주세요.';
  end if;
  reply_id := public.add_lesson_comment(p_lesson_id, p_body);
  update public.lesson_comments set parent_comment_id = p_parent_comment_id where id = reply_id;
  return reply_id;
end;
$$;

create or replace function public.delete_lesson_comment(p_comment_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  target_comment public.lesson_comments%rowtype;
  current_member_id uuid;
  is_admin boolean;
begin
  select * into target_comment from public.lesson_comments where id = p_comment_id for update;
  if not found then raise exception '삭제할 댓글을 찾을 수 없습니다.'; end if;
  select id into current_member_id from public.members where auth_user_id = auth.uid() limit 1;
  is_admin := lower(coalesce(auth.jwt() ->> 'email', '')) in ('ljw022072@gmail.com', 'admin@admins.leeswimlesson.com');
  if not is_admin and (current_member_id is null or target_comment.author_member_id is distinct from current_member_id) then
    raise exception '본인이 작성한 댓글만 삭제할 수 있습니다.';
  end if;
  -- 답글 연결을 유지하고 삭제된 본문은 남기지 않습니다.
  update public.lesson_comments set body = '삭제된 댓글입니다.', deleted_at = now() where id = p_comment_id;
end;
$$;




revoke all on function public.can_access_lesson_comments(uuid) from public;
revoke all on function public.get_lesson_comments(uuid) from public;
revoke all on function public.add_lesson_comment(uuid, text) from public;
revoke all on function public.delete_lesson_comment(uuid) from public;
revoke all on function public.get_lesson_comment_notifications() from public;
revoke all on function public.get_lesson_note_notifications() from public;
grant execute on function public.get_lesson_comments(uuid) to authenticated;
grant execute on function public.add_lesson_comment(uuid, text) to authenticated;
grant execute on function public.delete_lesson_comment(uuid) to authenticated;
grant execute on function public.get_lesson_comment_notifications() to authenticated;
grant execute on function public.get_lesson_note_notifications() to authenticated;
revoke all on function public.get_lesson_comment_threads(uuid) from public, anon;
revoke all on function public.add_lesson_reply(uuid,text,uuid) from public, anon;
grant execute on function public.get_lesson_comment_threads(uuid) to authenticated;
grant execute on function public.add_lesson_reply(uuid,text,uuid) to authenticated;

-- 예정 수업은 관리자 수업 기록이 없어도 날짜/시간으로 댓글을 저장합니다.
-- 수업 기록을 새로 생성하거나 완료 상태/횟수를 변경하지 않습니다.
create or replace function public.can_access_member_lesson_slot(p_lesson_type text, p_lesson_date date, p_lesson_time time)
returns boolean language plpgsql stable security definer set search_path = public, auth as $$
begin
 if auth.uid() is null or p_lesson_date is null or p_lesson_time is null then return false; end if;
 if p_lesson_type not in ('personal','group','makeup') then return false; end if;
 if public.is_swim_admin() then return true; end if;
 if exists(select 1 from public.lessons l where l.lesson_type=p_lesson_type and l.lesson_date=p_lesson_date and l.lesson_time=p_lesson_time and l.status not in ('cancelled','deleted') and public.can_access_lesson_comments(l.id)) then return true; end if;
 if p_lesson_type='group' then
  return exists(select 1 from public.members m cross join lateral jsonb_array_elements(coalesce(m.group_lessons,'[]'::jsonb)) item
    where m.auth_user_id=auth.uid() and item->>'day' = extract(dow from p_lesson_date)::integer::text and left(item->>'time',5)=to_char(p_lesson_time,'HH24:MI'));
 elsif p_lesson_type='personal' then
  return exists(select 1 from public.members m where m.auth_user_id=auth.uid() and m.total_lessons>0
    and m.lesson_time=p_lesson_time and (array['일','월','화','수','목','금','토'])[extract(dow from p_lesson_date)::integer+1]=any(m.days)
    and p_lesson_date>=coalesce(m.lesson_start_date,m.payment_date,m.created_at::date)
    and not exists(select 1 from public.lessons l where l.member_id=m.id and l.lesson_type='personal' and l.lesson_date=p_lesson_date and l.lesson_time=p_lesson_time and l.status in ('cancelled','deleted')));
 elsif p_lesson_type='makeup' then
  return exists(select 1 from public.makeup_requests r join public.members m on m.id=r.member_id join public.makeup_slots s on s.id=r.slot_id
    where m.auth_user_id=auth.uid() and r.status='approved' and s.slot_date=p_lesson_date and s.slot_time=p_lesson_time);
 end if;
 return false;
end;
$$;

create or replace function public.get_member_lesson_thread(p_lesson_type text,p_lesson_date date,p_lesson_time time)
returns table(id uuid,author_name text,body text,created_at timestamptz,is_mine boolean,parent_comment_id uuid,is_deleted boolean)
language plpgsql security definer set search_path=public,auth as $$
begin
 if not public.can_access_member_lesson_slot(p_lesson_type,p_lesson_date,p_lesson_time) then raise exception '이 수업의 댓글을 볼 권한이 없습니다.'; end if;
 return query select c.id,coalesce(c.author_name,m.name,'회원'),c.body,c.created_at,
 public.is_swim_admin() or m.auth_user_id=auth.uid(),c.parent_comment_id,c.deleted_at is not null
 from public.lesson_comments c left join public.members m on m.id=c.author_member_id
 where c.lesson_type=p_lesson_type and c.lesson_date=p_lesson_date and c.lesson_time=p_lesson_time order by c.created_at,c.id;
end;
$$;

create or replace function public.add_member_lesson_comment(p_lesson_type text,p_lesson_date date,p_lesson_time time,p_body text,p_parent_comment_id uuid default null)
returns uuid language plpgsql security definer set search_path=public,auth as $$
declare member_id uuid; comment_id uuid; parent public.lesson_comments%rowtype;
begin
 if not public.can_access_member_lesson_slot(p_lesson_type,p_lesson_date,p_lesson_time) then raise exception '이 수업에 댓글을 작성할 권한이 없습니다.'; end if;
 if char_length(trim(coalesce(p_body,''))) not between 1 and 500 then raise exception '댓글은 1자 이상 500자 이하로 입력해주세요.'; end if;
 if p_parent_comment_id is not null then
  select * into parent from public.lesson_comments where id=p_parent_comment_id for update;
  if not found or parent.deleted_at is not null or parent.parent_comment_id is not null
   or parent.lesson_type is distinct from p_lesson_type or parent.lesson_date is distinct from p_lesson_date or parent.lesson_time is distinct from p_lesson_time then
   raise exception '같은 수업의 원래 댓글에 답글을 작성해주세요.';
  end if;
 end if;
 select m.id into member_id from public.members m where m.auth_user_id=auth.uid() limit 1;
 insert into public.lesson_comments(lesson_type,lesson_date,lesson_time,author_member_id,author_role,author_name,body,parent_comment_id)
 values(p_lesson_type,p_lesson_date,p_lesson_time,member_id,case when public.is_swim_admin() then 'admin' else 'member' end,case when public.is_swim_admin() then '이정우' else null end,trim(p_body),p_parent_comment_id)
 returning id into comment_id;
 return comment_id;
end;
$$;
revoke all on function public.can_access_member_lesson_slot(text,date,time) from public,anon;
revoke all on function public.get_member_lesson_thread(text,date,time) from public,anon;
revoke all on function public.add_member_lesson_comment(text,date,time,text,uuid) from public,anon;
grant execute on function public.can_access_member_lesson_slot(text,date,time) to authenticated;
grant execute on function public.get_member_lesson_thread(text,date,time) to authenticated;
grant execute on function public.add_member_lesson_comment(text,date,time,text,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
