begin;

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
