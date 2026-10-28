-- Profit tracking: marketplace fees and seller-paid shipping on each order (item prices, costs,
-- brands and categories live in the order's items), and an inventory of everything the seller owns.

alter table public.orders add column if not exists fees numeric(10, 2);
alter table public.orders add column if not exists shipping_cost numeric(10, 2);

create table if not exists public.inventory_items (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  sku text not null,
  title text not null,
  brand text,
  category text,
  size text,
  cost numeric(10, 2),
  list_price numeric(10, 2),
  source text,
  purchased_at date,
  listed_at date,
  sold_at date,
  status text not null default 'listed' check (status in ('draft', 'listed', 'sold')),
  platforms jsonb not null default '[]'::jsonb,
  photo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_items_user_sku_idx on public.inventory_items (user_id, sku);

alter table public.inventory_items enable row level security;

create policy "Users manage their own inventory" on public.inventory_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger inventory_items_touch before update on public.inventory_items
  for each row execute function public.touch_updated_at();
