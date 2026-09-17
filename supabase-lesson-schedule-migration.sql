begin;

alter table public.members
add column if not exists lesson_start_date date;

alter table public.lessons
add column if not exists memo text;

notify pgrst, 'reload schema';

commit;
