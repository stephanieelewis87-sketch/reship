-- User feedback, and the AI summaries the app owner reads to decide what to change.
-- 0005 belongs to crosslisting; this file only adds new tables.

-- Who can read everyone's feedback and the summaries. Add a row by hand for the owner:
--   insert into public.app_admins (user_id) select id from auth.users where email = 'you@example.com';
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.app_admins enable row level security;

create policy "Admins can see that they are admins" on public.app_admins
  for select using (auth.uid() = user_id);

create or replace function public.is_app_admin() returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from public.app_admins where user_id = auth.uid()) $$;

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null default auth.uid(),
  kind text not null default 'idea' check (kind in ('bug', 'idea', 'confusing', 'praise')),
  area text not null default 'Other',
  message text not null check (char_length(message) between 1 and 5000),
  rating smallint check (rating between 1 and 5),
  page text,
  status text not null default 'new' check (status in ('new', 'planned', 'done', 'declined')),
  summarized_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists feedback_created_idx on public.feedback (created_at desc);
create index if not exists feedback_unsummarized_idx on public.feedback (created_at) where summarized_at is null;

alter table public.feedback enable row level security;

create policy "Users send feedback" on public.feedback
  for insert with check (auth.uid() = user_id);
create policy "Users read their own feedback" on public.feedback
  for select using (auth.uid() = user_id or public.is_app_admin());
create policy "Admins update feedback status" on public.feedback
  for update using (public.is_app_admin()) with check (public.is_app_admin());

-- One row per digest the feedback-digest Edge Function writes.
create table if not exists public.feedback_summaries (
  id uuid primary key default gen_random_uuid(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  feedback_count integer not null default 0,
  summary jsonb not null,
  model text,
  emailed_to text,
  created_at timestamptz not null default now()
);

alter table public.feedback_summaries enable row level security;

create policy "Admins read summaries" on public.feedback_summaries
  for select using (public.is_app_admin());
