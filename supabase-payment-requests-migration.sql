begin;

create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  payment_date date not null,
  payment_amount integer not null check (payment_amount > 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create unique index if not exists payment_requests_one_pending_idx
on public.payment_requests(member_id) where status = 'pending';
create index if not exists payment_requests_status_idx
on public.payment_requests(status, requested_at desc);
alter table public.payment_requests enable row level security;
grant select on public.payment_requests to authenticated;
grant select, insert, update on public.payment_requests to service_role;

drop policy if exists "members read own payment requests" on public.payment_requests;
drop policy if exists "admin reads payment requests" on public.payment_requests;
create policy "members read own payment requests"
on public.payment_requests for select to authenticated
using (exists (select 1 from public.members m where m.id = member_id and m.auth_user_id = auth.uid()));
create policy "admin reads payment requests"
on public.payment_requests for select to authenticated
using (lower(coalesce(auth.jwt()->>'email', '')) in ('ljw022072@gmail.com', 'admin@admins.leeswimlesson.com'));

create or replace function public.request_member_payment(p_member_id uuid, p_payment_date date, p_payment_amount integer)
returns uuid language plpgsql security definer set search_path = public
as $$
declare request_id uuid;
begin
  perform 1 from public.members where id = p_member_id and auth_user_id = auth.uid() for update;
  if not found then raise exception '본인의 입금만 알릴 수 있습니다.'; end if;
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

create or replace function public.confirm_member_payment(p_request_id uuid)
returns uuid language plpgsql security definer set search_path = public
as $$
declare request public.payment_requests%rowtype;
begin
  if auth.uid() is null or lower(coalesce(auth.jwt()->>'email', '')) not in
    ('ljw022072@gmail.com', 'admin@admins.leeswimlesson.com') then
    raise exception '관리자만 입금을 확인할 수 있습니다.';
  end if;
  select * into request from public.payment_requests where id = p_request_id for update;
  if not found then raise exception '입금 알림을 찾지 못했습니다.'; end if;
  -- A repeated click must not overwrite a later payment.
  if request.status = 'confirmed' then return request.id; end if;
  update public.members set payment_date = request.payment_date,
    payment_amount = request.payment_amount, payment_status = '완납', updated_at = now()
  where id = request.member_id;
  if not found then raise exception '회원을 찾지 못했습니다.'; end if;
  update public.payment_requests set status = 'confirmed', reviewed_at = now() where id = request.id;
  return request.id;
end;
$$;
revoke all on function public.request_member_payment(uuid, date, integer) from public, anon;
revoke all on function public.confirm_member_payment(uuid) from public, anon;
grant execute on function public.request_member_payment(uuid, date, integer) to authenticated;
grant execute on function public.confirm_member_payment(uuid) to authenticated;

commit;
