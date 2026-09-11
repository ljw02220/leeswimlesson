-- 개인레슨 보고 완료 기준 정산용 컬럼
alter table public.members
add column if not exists personal_reported_at date;

alter table public.members
add column if not exists personal_reported_payment_date date;
