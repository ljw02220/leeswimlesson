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

create unique index if not exists makeup_requests_active_slot_idx
on public.makeup_requests(slot_id)
where status in ('pending', 'approved');

alter table public.makeup_slots enable row level security;
alter table public.makeup_requests enable row level security;

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
using ((auth.jwt() ->> 'email') = 'ljw022072@gmail.com')
with check ((auth.jwt() ->> 'email') = 'ljw022072@gmail.com');

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
using ((auth.jwt() ->> 'email') = 'ljw022072@gmail.com')
with check ((auth.jwt() ->> 'email') = 'ljw022072@gmail.com');

notify pgrst, 'reload schema';

commit;
