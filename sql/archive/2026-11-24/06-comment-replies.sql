-- 기존 03번 수업 댓글 SQL 적용 후 실행하세요. 기존 댓글은 유지됩니다.
begin;
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
revoke all on function public.get_lesson_comment_threads(uuid) from public, anon;
revoke all on function public.add_lesson_reply(uuid,text,uuid) from public, anon;
grant execute on function public.get_lesson_comment_threads(uuid) to authenticated;
grant execute on function public.add_lesson_reply(uuid,text,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
