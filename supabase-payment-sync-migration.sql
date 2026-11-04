-- Run after supabase-payment-requests-migration.sql.
begin;

alter table public.members add column if not exists current_payment_request_id uuid
  references public.payment_requests(id) on delete set null;

-- Link each member to their latest confirmed payment, without changing older payments.
update public.members m set current_payment_request_id = (
  select r.id from public.payment_requests r
  where r.member_id = m.id and r.status = 'confirmed'
  order by r.reviewed_at desc nulls last, r.requested_at desc, r.id desc limit 1
) where m.current_payment_request_id is null;

-- Existing differences: the administrator's current member data takes precedence.
update public.personal_lesson_reports report
set payment_date = m.payment_date, payment_amount = m.payment_amount
from public.members m join public.payment_requests r on r.id = m.current_payment_request_id
where report.member_id = m.id and r.member_id = m.id and r.status = 'confirmed'
  and report.payment_date = r.payment_date and report.payment_amount = r.payment_amount
  and m.payment_date is not null and m.payment_amount > 0;

update public.payment_requests r
set payment_date = m.payment_date, payment_amount = m.payment_amount
from public.members m where m.current_payment_request_id = r.id
  and r.member_id = m.id and r.status = 'confirmed'
  and m.payment_date is not null and m.payment_amount > 0
  and (r.payment_date, r.payment_amount) is distinct from (m.payment_date, m.payment_amount);

create or replace function public.sync_member_payment_records()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  -- Confirming a NEW payment must not rewrite the previous payment cycle.
  if new.current_payment_request_id is distinct from old.current_payment_request_id then return new; end if;
  if (new.payment_date, new.payment_amount) is not distinct from (old.payment_date, old.payment_amount) then return new; end if;
  if new.current_payment_request_id is not null and (new.payment_date is null or coalesce(new.payment_amount, 0) <= 0) then
    raise exception '확인된 입금의 결제일과 금액을 비울 수 없습니다.';
  end if;
  update public.payment_requests set payment_date = new.payment_date, payment_amount = new.payment_amount
  where id = new.current_payment_request_id and member_id = new.id and status = 'confirmed'
    and (payment_date, payment_amount) is distinct from (new.payment_date, new.payment_amount);
  update public.personal_lesson_reports set payment_date = new.payment_date, payment_amount = new.payment_amount
  where member_id = new.id and payment_date = old.payment_date and payment_amount = old.payment_amount
    and (payment_date, payment_amount) is distinct from (new.payment_date, new.payment_amount);
  if new.personal_reported_payment_date = old.payment_date then
    update public.members set personal_reported_payment_date = new.payment_date where id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.sync_confirmed_payment_member()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if old.status = 'confirmed' and new.status = 'confirmed'
    and (new.payment_date, new.payment_amount) is distinct from (old.payment_date, old.payment_amount) then
    update public.members set payment_date = new.payment_date, payment_amount = new.payment_amount, updated_at = now()
    where id = new.member_id and current_payment_request_id = new.id
      and (payment_date, payment_amount) is distinct from (new.payment_date, new.payment_amount);
  end if;
  return new;
end;
$$;

create or replace function public.sync_report_payment_member()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if (new.payment_date, new.payment_amount) is distinct from (old.payment_date, old.payment_amount) then
    update public.members set payment_date = new.payment_date, payment_amount = new.payment_amount, updated_at = now()
    where id = new.member_id and payment_date = old.payment_date and payment_amount = old.payment_amount;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_member_payment_records on public.members;
create trigger sync_member_payment_records after update of payment_date, payment_amount on public.members
for each row execute function public.sync_member_payment_records();
drop trigger if exists sync_confirmed_payment_member on public.payment_requests;
create trigger sync_confirmed_payment_member after update of payment_date, payment_amount on public.payment_requests
for each row execute function public.sync_confirmed_payment_member();
drop trigger if exists sync_report_payment_member on public.personal_lesson_reports;
create trigger sync_report_payment_member after update of payment_date, payment_amount on public.personal_lesson_reports
for each row execute function public.sync_report_payment_member();

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
    current_payment_request_id = request.id, updated_at = now()
  where id = request.member_id;
  update public.payment_requests set status = 'confirmed', reviewed_at = now() where id = request.id;
  return request.id;
end;
$$;

revoke all on function public.sync_member_payment_records() from public, anon, authenticated;
revoke all on function public.sync_confirmed_payment_member() from public, anon, authenticated;
revoke all on function public.sync_report_payment_member() from public, anon, authenticated;
revoke all on function public.confirm_member_payment(uuid) from public, anon;
grant execute on function public.confirm_member_payment(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
