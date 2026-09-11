-- 개인레슨 보고 완료 기준 정산용 컬럼
alter table public.members
add column if not exists personal_reported_at date;

alter table public.members
add column if not exists personal_reported_payment_date date;

create table if not exists public.personal_lesson_reports (
  id uuid primary key default gen_random_uuid(),

  member_id uuid
    references public.members(id)
    on delete set null,

  member_name text not null,
  phone text,
  lesson_format text,
  days text[],
  lesson_time time,

  payment_amount integer not null default 0,
  payment_date date not null,
  payment_status text not null default '완납',

  reported_at date not null,
  memo text,

  created_at timestamptz not null default now()
);

alter table public.personal_lesson_reports
enable row level security;

grant select, insert, update, delete
on public.personal_lesson_reports
to authenticated;

drop policy if exists "authenticated personal lesson reports access"
on public.personal_lesson_reports;

create policy "authenticated personal lesson reports access"
on public.personal_lesson_reports
for all
to authenticated
using (true)
with check (true);

insert into public.personal_lesson_reports (
  member_id,
  member_name,
  phone,
  lesson_format,
  days,
  lesson_time,
  payment_amount,
  payment_date,
  payment_status,
  reported_at,
  memo
)
select
  id,
  name,
  phone,
  lesson_format,
  days,
  lesson_time,
  payment_amount,
  payment_date,
  payment_status,
  personal_reported_at,
  memo
from public.members
where personal_reported_at is not null
  and payment_date is not null
  and payment_amount > 0
  and not exists (
    select 1
    from public.personal_lesson_reports
    where personal_lesson_reports.member_id = members.id
      and personal_lesson_reports.payment_date = members.payment_date
      and personal_lesson_reports.reported_at = members.personal_reported_at
  );
