-- 회원 및 개인레슨 보고에 단지 구분과 결제 방식을 저장합니다.

alter table public.members
add column if not exists residence_type text;

alter table public.members
add column if not exists payment_method text;

alter table public.personal_lesson_reports
add column if not exists residence_type text;

alter table public.personal_lesson_reports
add column if not exists payment_method text;

update public.personal_lesson_reports as report
set
  residence_type = coalesce(report.residence_type, member.residence_type),
  payment_method = coalesce(report.payment_method, member.payment_method)
from public.members as member
where report.member_id = member.id
  and (
    report.residence_type is null
    or report.payment_method is null
  );

notify pgrst, 'reload schema';
