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

delete from public.makeup_slots as slot
where extract(dow from slot.slot_date)::integer = 5
  and slot.slot_time = '19:00'::time
  and slot.slot_date >= current_date
  and not exists (
    select 1
    from public.makeup_requests as request
    where request.slot_id = slot.id
      and request.status in ('pending', 'approved')
  );

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
  (auth.jwt() ->> 'email') = 'ljw022072@gmail.com'
  or (auth.jwt() ->> 'email') like '%@admins.leeswimlesson.com'
)
with check (
  (auth.jwt() ->> 'email') = 'ljw022072@gmail.com'
  or (auth.jwt() ->> 'email') like '%@admins.leeswimlesson.com'
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
    select 1 from public.members
    where members.id = makeup_requests.member_id
      and members.auth_user_id = auth.uid()
  )
);

create policy "admin manages makeup requests"
on public.makeup_requests
for all to authenticated
using (
  (auth.jwt() ->> 'email') = 'ljw022072@gmail.com'
  or (auth.jwt() ->> 'email') like '%@admins.leeswimlesson.com'
)
with check (
  (auth.jwt() ->> 'email') = 'ljw022072@gmail.com'
  or (auth.jwt() ->> 'email') like '%@admins.leeswimlesson.com'
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
begin
  if (auth.jwt() ->> 'email') is distinct from 'ljw022072@gmail.com' then
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
  set status = p_decision, reviewed_at = now()
  where id = p_request_id;

  update public.makeup_slots
  set status = case when p_decision = 'approved' then 'booked' else 'open' end
  where id = target_request.slot_id;
end;
$$;

revoke all on function public.review_makeup_request(uuid, text) from public;
grant execute on function public.review_makeup_request(uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
