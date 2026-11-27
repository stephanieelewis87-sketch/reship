-- Crosslisting and delisting through the Reship browser extension.
-- The app queues jobs; the extension, signed in as the same user, works through them in the
-- seller's browser and records each listing it makes.

create table if not exists public.listing_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  platform text not null,
  action text not null check (action in ('list', 'delist')),
  -- For 'list': the ListingDraft to fill into the marketplace's sell form.
  draft jsonb,
  -- For 'delist': the marketplace's id for the listing.
  listing_id text,
  inventory_item_id text,
  sku text,
  status text not null default 'queued' check (status in ('queued', 'running', 'needs_you', 'done', 'failed', 'cancelled')),
  message text,
  -- Why it was queued, e.g. 'sold on Mercari' for an automatic delist.
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listing_jobs_user_status_idx on public.listing_jobs (user_id, status, created_at);

-- Every listing Reship knows about on each marketplace, so a sale on one can delist the others.
-- inventory_item_id points at inventory_items.id (migration 0004) when the item is in inventory.
create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  platform text not null,
  listing_id text not null,
  url text,
  sku text,
  inventory_item_id text,
  title text,
  price numeric,
  status text not null default 'active' check (status in ('active', 'delisted', 'sold')),
  listed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists marketplace_listings_user_platform_listing_idx
  on public.marketplace_listings (user_id, platform, listing_id);
create index if not exists marketplace_listings_user_sku_idx on public.marketplace_listings (user_id, sku);
create index if not exists marketplace_listings_user_item_idx on public.marketplace_listings (user_id, inventory_item_id);

alter table public.listing_jobs enable row level security;
alter table public.marketplace_listings enable row level security;

drop policy if exists "Users manage their own listing jobs" on public.listing_jobs;
create policy "Users manage their own listing jobs" on public.listing_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own marketplace listings" on public.marketplace_listings;
create policy "Users manage their own marketplace listings" on public.marketplace_listings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists listing_jobs_touch on public.listing_jobs;
create trigger listing_jobs_touch before update on public.listing_jobs
  for each row execute function public.touch_updated_at();
drop trigger if exists marketplace_listings_touch on public.marketplace_listings;
create trigger marketplace_listings_touch before update on public.marketplace_listings
  for each row execute function public.touch_updated_at();
