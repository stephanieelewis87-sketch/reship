-- Receipt photos on expenses. Receipts are private: only their owner can see them, through
-- short-lived links. Each user writes only inside a folder named after their id.
alter table public.expenses add column if not exists receipt text;

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "Users read their own receipts" on storage.objects;
create policy "Users read their own receipts" on storage.objects
  for select using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users upload their own receipts" on storage.objects;
create policy "Users upload their own receipts" on storage.objects
  for insert with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete their own receipts" on storage.objects;
create policy "Users delete their own receipts" on storage.objects
  for delete using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
