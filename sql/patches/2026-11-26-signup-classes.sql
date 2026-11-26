alter table public.signup_requests add column if not exists group_lessons jsonb not null default '[]'::jsonb;
notify pgrst, 'reload schema';
