create table if not exists public.lesson_comments (
  id uuid primary key default gen_random_uuid(),
  lesson_type text not null,
  lesson_date date not null,
  lesson_time time not null,
  author_member_id uuid not null references public.members(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists lesson_comments_thread_idx
on public.lesson_comments (lesson_type, lesson_date, lesson_time, created_at);

alter table public.lesson_comments enable row level security;

create or replace function public.can_access_lesson_comments(p_lesson_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_lesson public.lessons%rowtype;
  current_member public.members%rowtype;
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

  select * into current_member
  from public.members
  where auth_user_id = auth.uid()
  limit 1;

  if not found then return false; end if;

  if target_lesson.lesson_type = 'personal' then
    return exists (
      select 1
      from public.lessons
      where member_id = current_member.id
        and lesson_type = target_lesson.lesson_type
        and lesson_date = target_lesson.lesson_date
        and lesson_time = target_lesson.lesson_time
        and status = 'completed'
    ) or current_member.name = any(
      regexp_split_to_array(coalesce(target_lesson.title, ''), '\s*,\s*')
    );
  end if;

  if target_lesson.lesson_type = 'makeup' then
    return exists (
      select 1
      from public.lessons
      where member_id = current_member.id
        and lesson_type = 'makeup'
        and lesson_date = target_lesson.lesson_date
        and lesson_time = target_lesson.lesson_time
        and status = 'completed'
    );
  end if;

  if target_lesson.lesson_type = 'group' then
    return exists (
      select 1
      from jsonb_array_elements(coalesce(current_member.group_lessons, '[]'::jsonb)) item
      where (item ->> 'day')::integer = extract(dow from target_lesson.lesson_date)::integer
        and left(item ->> 'time', 5) = to_char(target_lesson.lesson_time, 'HH24:MI')
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
begin
  if not public.can_access_lesson_comments(p_lesson_id) then
    raise exception '이 수업의 댓글을 볼 권한이 없습니다.';
  end if;

  select * into target_lesson from public.lessons where lessons.id = p_lesson_id;
  select members.id into current_member_id
  from public.members
  where auth_user_id = auth.uid()
  limit 1;

  return query
  select
    comment.id,
    member.name,
    comment.body,
    comment.created_at,
    comment.author_member_id = current_member_id
  from public.lesson_comments comment
  join public.members member on member.id = comment.author_member_id
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

  if current_member_id is null then
    raise exception '회원 정보를 찾을 수 없습니다.';
  end if;

  insert into public.lesson_comments (
    lesson_type,
    lesson_date,
    lesson_time,
    author_member_id,
    body
  ) values (
    target_lesson.lesson_type,
    target_lesson.lesson_date,
    target_lesson.lesson_time,
    current_member_id,
    trim(p_body)
  )
  returning id into new_comment_id;

  return new_comment_id;
end;
$$;

create or replace function public.delete_lesson_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_comment public.lesson_comments%rowtype;
  current_member_id uuid;
  is_admin boolean;
begin
  select * into target_comment
  from public.lesson_comments
  where id = p_comment_id;

  if not found then
    raise exception '삭제할 댓글을 찾을 수 없습니다.';
  end if;

  select members.id into current_member_id
  from public.members
  where auth_user_id = auth.uid()
  limit 1;

  is_admin := lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'ljw022072@gmail.com',
    'admin@admins.leeswimlesson.com'
  );

  if not is_admin and target_comment.author_member_id is distinct from current_member_id then
    raise exception '본인이 작성한 댓글만 삭제할 수 있습니다.';
  end if;

  delete from public.lesson_comments
  where id = p_comment_id;
end;
$$;

revoke all on function public.can_access_lesson_comments(uuid) from public;
revoke all on function public.get_lesson_comments(uuid) from public;
revoke all on function public.add_lesson_comment(uuid, text) from public;
revoke all on function public.delete_lesson_comment(uuid) from public;

grant execute on function public.get_lesson_comments(uuid) to authenticated;
grant execute on function public.add_lesson_comment(uuid, text) to authenticated;
grant execute on function public.delete_lesson_comment(uuid) to authenticated;

notify pgrst, 'reload schema';
