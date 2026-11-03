-- Inventory Guardian: dated backups of the whole inventory, and a history of every change to
-- each item. Items also gain a storage location and marketplace listing IDs, which live in the
-- existing details and listings JSON columns, so inventory_items needs no change.

create table if not exists public.inventory_backups (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  reason text not null default 'Backup',
  item_count integer not null default 0,
  items jsonb not null default '[]'::jsonb
);

create index if not exists inventory_backups_user_created_idx on public.inventory_backups (user_id, created_at desc);

alter table public.inventory_backups enable row level security;

create policy "Users manage their own inventory backups" on public.inventory_backups
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.inventory_history (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  item_id text not null,
  sku text not null default '',
  at timestamptz not null default now(),
  source text not null default 'You',
  kind text not null check (kind in ('created', 'edited', 'deleted')),
  changes jsonb not null default '[]'::jsonb
);

create index if not exists inventory_history_user_item_idx on public.inventory_history (user_id, item_id, at desc);

alter table public.inventory_history enable row level security;

-- History is append-only from the app: people can read and add their own, not rewrite it.
create policy "Users read their own inventory history" on public.inventory_history
  for select using (auth.uid() = user_id);
create policy "Users add to their own inventory history" on public.inventory_history
  for insert with check (auth.uid() = user_id);
