-- 입금 확인 → 보고 예정 연결 수정. 기존 입금/보고 내역은 삭제하지 않습니다.
-- 기존 payment-requests / payment-sync / finance-report 마이그레이션 적용 후 실행합니다.
begin;
alter table public.members add column if not exists current_payment_request_id uuid
  references public.payment_requests(id) on delete set null;

create or replace function public.confirm_member_payment(p_request_id uuid)
returns uuid language plpgsql security definer set search_path = public
as $$
declare request public.payment_requests%rowtype;
  target_member_id uuid;
begin
  if auth.uid() is null or lower(coalesce(auth.jwt()->>'email', '')) not in
    ('ljw022072@gmail.com', 'admin@admins.leeswimlesson.com') then
    raise exception '관리자만 입금을 확인할 수 있습니다.';
  end if;
  select member_id into target_member_id from public.payment_requests where id = p_request_id;
  if not found then raise exception '입금 알림을 찾지 못했습니다.'; end if;
  -- Consistent lock order with member edits and new requests.
  perform 1 from public.members where id = target_member_id for update;
  if not found then raise exception '회원을 찾지 못했습니다.'; end if;
  select * into request from public.payment_requests where id = p_request_id for update;
  if not found then raise exception '입금 알림을 찾지 못했습니다.'; end if;
  if request.status = 'confirmed' then return request.id; end if;
  update public.members set payment_date = request.payment_date,
    payment_amount = request.payment_amount, payment_status = '완납',
    current_payment_request_id = request.id, personal_reported_at = null,
    personal_reported_payment_date = null, updated_at = now()
  where id = request.member_id;
  update public.payment_requests set status = 'confirmed', reviewed_at = now() where id = request.id;
  return request.id;
end;
$$;

create or replace function public.admin_confirm_member_payment(
  p_member_id uuid, p_payment_date date, p_payment_amount integer
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare m public.members%rowtype; request public.payment_requests%rowtype; request_id uuid;
begin
  if auth.uid() is null or lower(coalesce(auth.jwt()->>'email','')) not in
    ('ljw022072@gmail.com','admin@admins.leeswimlesson.com') then
    raise exception '관리자만 입금을 확인할 수 있습니다.';
  end if;
  select * into m from public.members where id = p_member_id for update;
  if not found then raise exception '회원을 찾지 못했습니다.'; end if;
  if p_payment_date is null or p_payment_amount is null or p_payment_amount <= 0 then
    raise exception '입금일과 수강료를 입력해주세요.';
  end if;
  if m.payment_amount is distinct from p_payment_amount then
    raise exception '수강료가 변경되었습니다. 새로고침 후 다시 확인해주세요.';
  end if;
  -- Repeated confirmation of the same payment is harmless.
  select * into request from public.payment_requests
    where id = m.current_payment_request_id and member_id = m.id and status = 'confirmed'
      and payment_date = p_payment_date and payment_amount = p_payment_amount;
  if found then return request.id; end if;
  select * into request from public.payment_requests
    where member_id = m.id and status = 'pending' for update;
  if found then
    if (request.payment_date,request.payment_amount) is distinct from (p_payment_date,p_payment_amount) then
      raise exception '회원이 알린 입금과 날짜 또는 금액이 다릅니다. 확인 대기 내역을 먼저 확인해주세요.';
    end if;
    request_id := request.id;
  else
    insert into public.payment_requests(member_id,payment_date,payment_amount)
      values(m.id,p_payment_date,p_payment_amount) returning id into request_id;
  end if;
  return public.confirm_member_payment(request_id);
end;
$$;

create or replace function public.complete_personal_payment_report(
  p_member_id uuid, p_payment_date date, p_payment_amount integer, p_reported_at date
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare m public.members%rowtype; report_id uuid; report_date date;
begin
  if auth.uid() is null or lower(coalesce(auth.jwt()->>'email','')) not in
    ('ljw022072@gmail.com','admin@admins.leeswimlesson.com') then
    raise exception '관리자만 보고 완료할 수 있습니다.';
  end if;
  select * into m from public.members where id = p_member_id for update;
  if not found then raise exception '회원을 찾지 못했습니다.'; end if;
  if m.payment_date is null or coalesce(m.payment_amount,0) <= 0 or m.payment_status is distinct from '완납' then
    raise exception '입금 확인과 입금일 입력을 먼저 완료해주세요.';
  end if;
  if (m.payment_date,m.payment_amount) is distinct from (p_payment_date,p_payment_amount) then
    raise exception '결제정보가 변경되었습니다. 새로고침 후 다시 확인해주세요.';
  end if;
  if p_reported_at is null then raise exception '보고일을 입력해주세요.'; end if;
  select id, reported_at into report_id, report_date from public.personal_lesson_reports
    where member_id = m.id and payment_date = m.payment_date and payment_amount = m.payment_amount
    order by created_at desc, id desc limit 1;
  if report_id is null then
    insert into public.personal_lesson_reports (
      member_id, member_name, phone, lesson_format, days, lesson_time,
      payment_amount, payment_date, payment_status, residence_type, payment_method, reported_at
    ) values (
      m.id,m.name,m.phone,m.lesson_format,m.days,m.lesson_time,
      m.payment_amount,m.payment_date,m.payment_status,m.residence_type,m.payment_method,p_reported_at
    ) returning id into report_id;
    report_date := p_reported_at;
  end if;
  update public.members set personal_reported_at = report_date,
    personal_reported_payment_date = m.payment_date where id = m.id;
  return report_id;
end;
$$;
revoke all on function public.admin_confirm_member_payment(uuid,date,integer) from public, anon;
grant execute on function public.admin_confirm_member_payment(uuid,date,integer) to authenticated;
revoke all on function public.confirm_member_payment(uuid) from public, anon;
grant execute on function public.confirm_member_payment(uuid) to authenticated;
revoke all on function public.complete_personal_payment_report(uuid,date,integer,date) from public, anon;
grant execute on function public.complete_personal_payment_report(uuid,date,integer,date) to authenticated;
notify pgrst, 'reload schema';
commit;
