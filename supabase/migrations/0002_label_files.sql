-- Marketplace label PDFs. Each order can have one uploaded label, stored in a private bucket
-- under a folder named after the user's id, so people can only reach their own files.

alter table public.orders add column if not exists label jsonb;

insert into storage.buckets (id, name, public)
values ('labels', 'labels', false)
on conflict (id) do nothing;

create policy "Users read their own labels" on storage.objects
  for select using (bucket_id = 'labels' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users upload their own labels" on storage.objects
  for insert with check (bucket_id = 'labels' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users replace their own labels" on storage.objects
  for update using (bucket_id = 'labels' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users delete their own labels" on storage.objects
  for delete using (bucket_id = 'labels' and (storage.foldername(name))[1] = auth.uid()::text);
