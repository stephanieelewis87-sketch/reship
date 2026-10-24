-- Orders and per-user settings for Reship. Every row belongs to one signed-in user,
-- and row level security makes sure people only ever see their own data.

create table if not exists public.orders (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  platform text not null,
  order_number text not null,
  buyer text not null default '',
  items jsonb not null default '[]'::jsonb,
  order_date date not null default current_date,
  status text not null default 'pending' check (status in ('pending', 'printed', 'shipped')),
  carrier text not null default '',
  tracking text,
  ship_to jsonb,
  parcel jsonb,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_user_date_idx on public.orders (user_id, order_date desc);
-- The same marketplace order can't be imported twice for one user.
create unique index if not exists orders_user_platform_number_idx on public.orders (user_id, platform, order_number);

create table if not exists public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.orders enable row level security;
alter table public.settings enable row level security;

create policy "Users manage their own orders" on public.orders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own settings" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();
