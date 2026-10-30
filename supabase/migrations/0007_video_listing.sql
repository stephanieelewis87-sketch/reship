-- "List with a video": listing photos and a log of AI use for the daily cap.
-- 0004 to 0006 belong to other changes; this file only adds new things.

-- Listing photos are public so marketplaces and the browser extension can load them by address.
-- Each user writes only inside a folder named after their id.
insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', true)
on conflict (id) do nothing;

create policy "Users upload their own listing photos" on storage.objects
  for insert with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users replace their own listing photos" on storage.objects
  for update using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users delete their own listing photos" on storage.objects
  for delete using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- One row per AI call from the video-listing function. Only that function (service role) writes.
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('detect', 'describe', 'photo')),
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_kind_time on public.ai_usage (user_id, kind, created_at desc);

alter table public.ai_usage enable row level security;

create policy "Users see their own AI use" on public.ai_usage
  for select using (auth.uid() = user_id);
