create or replace function public.review_makeup_request(
  p_request_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_request public.makeup_requests%rowtype;
  current_email text;
begin
  select lower(email)
  into current_email
  from auth.users
  where id = auth.uid();

  if current_email is distinct from 'ljw022072@gmail.com' then
    raise exception '관리자만 보강 신청을 처리할 수 있습니다.';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception '올바르지 않은 처리 상태입니다.';
  end if;

  select * into target_request
  from public.makeup_requests
  where id = p_request_id
    and status = 'pending'
  for update;

  if not found then
    raise exception '승인 대기 중인 보강 신청을 찾을 수 없습니다.';
  end if;

  update public.makeup_requests
  set status = p_decision,
      reviewed_at = now()
  where id = p_request_id;

  update public.makeup_slots
  set status = case
    when p_decision = 'approved' then 'booked'
    else 'open'
  end
  where id = target_request.slot_id;
end;
$$;

revoke all on function public.review_makeup_request(uuid, text) from public;
grant execute on function public.review_makeup_request(uuid, text) to authenticated;

notify pgrst, 'reload schema';
