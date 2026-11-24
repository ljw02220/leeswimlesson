-- 02 보강 관리 · 예약/승인/취소/보강 횟수
-- Supabase SQL Editor에서 파일 전체를 실행하세요.
begin;

create table if not exists public.makeup_slots (
  id uuid primary key default gen_random_uuid(),
  slot_date date not null,
  slot_time time not null,
  status text not null default 'open'
    check (status in ('open', 'booked', 'closed')),
  created_at timestamptz not null default now(),
  unique (slot_date, slot_time)
);

create table if not exists public.makeup_requests (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.makeup_slots(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.makeup_requests
drop constraint if exists makeup_requests_status_check;

alter table public.makeup_requests
add constraint makeup_requests_status_check
check (status in ('pending', 'approved', 'rejected', 'cancelled'));

create unique index if not exists makeup_requests_active_slot_idx
on public.makeup_requests(slot_id)
where status in ('pending', 'approved');

-- 시간표 생성은 앱이 ensure_makeup_slots()를 호출할 때 수행합니다.

alter table public.makeup_slots enable row level security;
alter table public.makeup_requests enable row level security;

grant select, insert, update, delete
on public.makeup_slots
to authenticated;

grant select, insert, update, delete
on public.makeup_requests
to authenticated;

drop policy if exists "authenticated makeup slots access" on public.makeup_slots;
drop policy if exists "makeup slots read" on public.makeup_slots;
drop policy if exists "makeup slots admin write" on public.makeup_slots;

create policy "makeup slots read"
on public.makeup_slots
for select to authenticated
using (true);

create policy "makeup slots admin write"
on public.makeup_slots
for all to authenticated
using (
  lower(auth.jwt() ->> 'email') = 'ljw022072@gmail.com'
)
with check (
  lower(auth.jwt() ->> 'email') = 'ljw022072@gmail.com'
);

drop policy if exists "authenticated makeup requests access" on public.makeup_requests;
drop policy if exists "members read own makeup requests" on public.makeup_requests;
drop policy if exists "members create own makeup requests" on public.makeup_requests;
drop policy if exists "admin manages makeup requests" on public.makeup_requests;

create policy "members read own makeup requests"
on public.makeup_requests
for select to authenticated
using (
  exists (
    select 1 from public.members
    where members.id = makeup_requests.member_id
      and members.auth_user_id = auth.uid()
  )
);

create policy "members create own makeup requests"
on public.makeup_requests
for insert to authenticated
with check (
  status = 'pending'
  and exists (
    select 1 from public.makeup_slots slot
    where slot.id = makeup_requests.slot_id
      and slot.status = 'open'
      and slot.slot_date between current_date and current_date + 14
  )
  and exists (
    select 1 from public.members
    where members.id = makeup_requests.member_id
      and members.auth_user_id = auth.uid()
  )
);

create policy "admin manages makeup requests"
on public.makeup_requests
for all to authenticated
using (
  lower(auth.jwt() ->> 'email') = 'ljw022072@gmail.com'
)
with check (
  lower(auth.jwt() ->> 'email') = 'ljw022072@gmail.com'
);

create or replace function public.cancel_makeup_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_request public.makeup_requests%rowtype;
  is_admin boolean;
  is_owner boolean;
begin
  select * into target_request
  from public.makeup_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception '보강 신청을 찾을 수 없습니다.';
  end if;

  is_admin := (auth.jwt() ->> 'email') = 'ljw022072@gmail.com';
  select exists (
    select 1 from public.members
    where members.id = target_request.member_id
      and members.auth_user_id = auth.uid()
  ) into is_owner;

  if not is_admin and not is_owner then
    raise exception '보강 신청을 취소할 권한이 없습니다.';
  end if;

  if target_request.status not in ('pending', 'approved') then
    raise exception '이미 처리된 보강 신청입니다.';
  end if;

  update public.makeup_requests
  set status = 'cancelled', reviewed_at = now()
  where id = p_request_id;

  update public.makeup_slots
  set status = 'open'
  where id = target_request.slot_id;
end;
$$;

revoke all on function public.cancel_makeup_request(uuid) from public;
grant execute on function public.cancel_makeup_request(uuid) to authenticated;

create or replace function public.ensure_makeup_slots()
returns void
language sql
security definer
set search_path = public
as $$
  with recurring_times(day_of_week, slot_time) as (
    values
      (0, '12:00'::time), (0, '13:00'::time),
      (2, '14:00'::time), (2, '15:00'::time),
      (3, '15:00'::time),
      (4, '14:00'::time), (4, '15:00'::time),
      (5, '07:00'::time), (5, '15:00'::time),
      (6, '11:00'::time), (6, '12:00'::time), (6, '13:00'::time)
  )
  insert into public.makeup_slots (slot_date, slot_time)
  select calendar_date::date, recurring_times.slot_time
  from generate_series(
    current_date,
    current_date + interval '45 days',
    interval '1 day'
  ) as calendar_date
  join recurring_times
    on extract(dow from calendar_date)::integer = recurring_times.day_of_week
  on conflict (slot_date, slot_time) do nothing;
$$;

revoke all on function public.ensure_makeup_slots() from public;
grant execute on function public.ensure_makeup_slots() to authenticated;



revoke all on function public.review_makeup_request(uuid, text) from public;
grant execute on function public.review_makeup_request(uuid, text) to authenticated;

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

  if current_email not in (
    'ljw022072@gmail.com',
    'admin@admins.leeswimlesson.com'
  ) then
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

create table if not exists public.makeup_credits (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  missed_date date,
  quantity integer not null check (quantity between 1 and 20),
  remaining_quantity integer not null check (remaining_quantity between 0 and 20),
  reason text check (char_length(trim(coalesce(reason, ''))) <= 500),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by text not null default 'member'
    check (requested_by in ('member', 'admin')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists makeup_credits_member_status_idx
on public.makeup_credits(member_id, status, requested_at desc);

create table if not exists public.makeup_credit_usages (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null references public.makeup_credits(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  quantity integer not null check (quantity between 1 and 20),
  usage_type text not null check (usage_type in ('lesson', 'payment_discount')),
  used_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists makeup_credit_usages_member_idx
on public.makeup_credit_usages(member_id, used_at desc);

alter table public.makeup_credits enable row level security;
alter table public.makeup_credit_usages enable row level security;

grant select, insert, update on public.makeup_credits to authenticated;
grant select, insert, delete on public.makeup_credit_usages to authenticated;

drop policy if exists "members read own makeup credits" on public.makeup_credits;
drop policy if exists "members request makeup credits" on public.makeup_credits;
drop policy if exists "admin manages makeup credits" on public.makeup_credits;

create policy "members read own makeup credits"
on public.makeup_credits
for select to authenticated
using (
  exists (
    select 1 from public.members member
    where member.id = makeup_credits.member_id
      and member.auth_user_id = auth.uid()
  )
);

create policy "members request makeup credits"
on public.makeup_credits
for insert to authenticated
with check (
  status = 'pending'
  and requested_by = 'member'
  and remaining_quantity = quantity
  and exists (
    select 1 from public.members member
    where member.id = makeup_credits.member_id
      and member.auth_user_id = auth.uid()
  )
);

create policy "admin manages makeup credits"
on public.makeup_credits
for all to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'ljw022072@gmail.com',
    'admin@admins.leeswimlesson.com'
  )
)
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'ljw022072@gmail.com',
    'admin@admins.leeswimlesson.com'
  )
);

drop policy if exists "members read own makeup credit usages" on public.makeup_credit_usages;
drop policy if exists "admin manages makeup credit usages" on public.makeup_credit_usages;

create policy "members read own makeup credit usages"
on public.makeup_credit_usages
for select to authenticated
using (
  exists (
    select 1 from public.members member
    where member.id = makeup_credit_usages.member_id
      and member.auth_user_id = auth.uid()
  )
);

create policy "admin manages makeup credit usages"
on public.makeup_credit_usages
for all to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'ljw022072@gmail.com',
    'admin@admins.leeswimlesson.com'
  )
)
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'ljw022072@gmail.com',
    'admin@admins.leeswimlesson.com'
  )
);

create or replace function public.review_makeup_credit(
  p_credit_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) not in (
    'ljw022072@gmail.com',
    'admin@admins.leeswimlesson.com'
  ) then
    raise exception '관리자만 보강 확인 요청을 처리할 수 있습니다.';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception '올바르지 않은 처리 상태입니다.';
  end if;

  update public.makeup_credits
  set status = p_decision,
      reviewed_at = now(),
      updated_at = now()
  where id = p_credit_id
    and status = 'pending';

  if not found then
    raise exception '승인 대기 중인 보강 확인 요청을 찾을 수 없습니다.';
  end if;
end;
$$;

create or replace function public.cancel_makeup_credit(p_credit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_credit public.makeup_credits%rowtype;
  is_admin boolean;
  is_owner boolean;
begin
  select * into target_credit
  from public.makeup_credits
  where id = p_credit_id
  for update;

  if not found then
    raise exception '보강 확인 요청을 찾을 수 없습니다.';
  end if;

  is_admin := lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'ljw022072@gmail.com',
    'admin@admins.leeswimlesson.com'
  );
  select exists (
    select 1 from public.members member
    where member.id = target_credit.member_id
      and member.auth_user_id = auth.uid()
  ) into is_owner;

  if not is_admin and not is_owner then
    raise exception '보강 확인 요청을 취소할 권한이 없습니다.';
  end if;

  if (not is_admin and target_credit.status <> 'pending')
     or (is_admin and target_credit.status not in ('pending', 'approved')) then
    raise exception '취소할 수 없는 보강 확인 요청입니다.';
  end if;

  if target_credit.status = 'approved'
     and target_credit.remaining_quantity <> target_credit.quantity then
    raise exception '사용 내역을 먼저 되돌린 후 승인을 취소해주세요.';
  end if;

  update public.makeup_credits
  set status = 'cancelled', updated_at = now()
  where id = p_credit_id;
end;
$$;

create or replace function public.use_makeup_credit(
  p_credit_id uuid,
  p_quantity integer,
  p_usage_type text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_credit public.makeup_credits%rowtype;
  new_usage_id uuid;
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) not in (
    'ljw022072@gmail.com',
    'admin@admins.leeswimlesson.com'
  ) then
    raise exception '관리자만 보강 횟수를 사용할 수 있습니다.';
  end if;

  if p_quantity < 1 or p_usage_type not in ('lesson', 'payment_discount') then
    raise exception '올바른 사용 횟수와 처리 방식을 입력해주세요.';
  end if;

  select * into target_credit
  from public.makeup_credits
  where id = p_credit_id
  for update;

  if not found or target_credit.status <> 'approved' then
    raise exception '승인된 보강 내역을 찾을 수 없습니다.';
  end if;

  if p_quantity > target_credit.remaining_quantity then
    raise exception '남은 보강 횟수보다 많이 처리할 수 없습니다.';
  end if;

  insert into public.makeup_credit_usages (
    credit_id, member_id, quantity, usage_type
  ) values (
    target_credit.id, target_credit.member_id, p_quantity, p_usage_type
  ) returning id into new_usage_id;

  update public.makeup_credits
  set remaining_quantity = remaining_quantity - p_quantity,
      updated_at = now()
  where id = target_credit.id;

  return new_usage_id;
end;
$$;

create or replace function public.undo_makeup_credit_usage(p_usage_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_usage public.makeup_credit_usages%rowtype;
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) not in (
    'ljw022072@gmail.com',
    'admin@admins.leeswimlesson.com'
  ) then
    raise exception '관리자만 보강 사용 내역을 취소할 수 있습니다.';
  end if;

  select * into target_usage
  from public.makeup_credit_usages
  where id = p_usage_id
  for update;

  if not found then
    raise exception '보강 사용 내역을 찾을 수 없습니다.';
  end if;

  update public.makeup_credits
  set remaining_quantity = remaining_quantity + target_usage.quantity,
      updated_at = now()
  where id = target_usage.credit_id;

  delete from public.makeup_credit_usages where id = p_usage_id;
end;
$$;

revoke all on function public.review_makeup_credit(uuid, text) from public;
revoke all on function public.cancel_makeup_credit(uuid) from public;
revoke all on function public.use_makeup_credit(uuid, integer, text) from public;
revoke all on function public.undo_makeup_credit_usage(uuid) from public;
grant execute on function public.review_makeup_credit(uuid, text) to authenticated;
grant execute on function public.cancel_makeup_credit(uuid) to authenticated;
grant execute on function public.use_makeup_credit(uuid, integer, text) to authenticated;
grant execute on function public.undo_makeup_credit_usage(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
