begin;

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
    where member_id = m.id and payment_date = m.payment_date
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
revoke all on function public.complete_personal_payment_report(uuid,date,integer,date) from public, anon;
grant execute on function public.complete_personal_payment_report(uuid,date,integer,date) to authenticated;
notify pgrst, 'reload schema';
commit;
