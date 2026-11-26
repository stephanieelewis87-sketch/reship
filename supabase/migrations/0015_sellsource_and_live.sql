-- SellSource (Hubby's own marketplace) and live shows.
--
-- Sellers open a storefront, copy items from their inventory into public listings, and run live
-- shows with quick auctions. Buyers don't need an account: they browse, chat, bid and pay through
-- Stripe Checkout. Money and order rows are only ever written by the Edge Functions (service role):
-- sellsource-checkout, sellsource-webhook and sellsource-connect.
-- Safe to run more than once.

-- The Shop tab's searches count against a daily cap, like Research comps.
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind in ('detect', 'group', 'describe', 'photo', 'comps', 'assistant', 'shop'));

-- ---------- Storefronts ----------

create table if not exists public.sellsource_sellers (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  handle text not null unique check (handle ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),
  shop_name text not null check (char_length(shop_name) between 1 and 60),
  bio text check (char_length(bio) <= 280),
  shipping_price numeric(10, 2) not null default 7.99 check (shipping_price between 0 and 100),
  extra_item_shipping numeric(10, 2) not null default 0 check (extra_item_shipping between 0 and 100),
  -- Set only by sellsource-connect / the webhook, from what Stripe says.
  stripe_account_id text,
  payouts text not null default 'none' check (payouts in ('none', 'pending', 'ready')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sellsource_sellers enable row level security;

drop policy if exists "Storefronts are public" on public.sellsource_sellers;
create policy "Storefronts are public" on public.sellsource_sellers for select using (true);
drop policy if exists "Sellers open their own storefront" on public.sellsource_sellers;
create policy "Sellers open their own storefront" on public.sellsource_sellers for insert with check (auth.uid() = user_id);
drop policy if exists "Sellers edit their own storefront" on public.sellsource_sellers;
create policy "Sellers edit their own storefront" on public.sellsource_sellers for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Everyone may read the public columns; nobody but the service role sees the Stripe account or
-- can change payouts.
revoke all on public.sellsource_sellers from anon, authenticated;
grant select (user_id, handle, shop_name, bio, shipping_price, extra_item_shipping, payouts) on public.sellsource_sellers to anon, authenticated;
grant insert (user_id, handle, shop_name, bio, shipping_price, extra_item_shipping) on public.sellsource_sellers to authenticated;
grant update (user_id, handle, shop_name, bio, shipping_price, extra_item_shipping) on public.sellsource_sellers to authenticated;

drop trigger if exists sellsource_sellers_touch on public.sellsource_sellers;
create trigger sellsource_sellers_touch before update on public.sellsource_sellers
  for each row execute function public.touch_updated_at();

-- ---------- Listings ----------

create table if not exists public.sellsource_listings (
  id text primary key,
  seller_id uuid not null references public.sellsource_sellers (user_id) on delete cascade default auth.uid(),
  handle text not null,
  shop_name text not null,
  inventory_id text not null,
  sku text not null default '',
  title text not null check (char_length(title) between 1 and 140),
  description text check (char_length(description) <= 5000),
  brand text,
  category text,
  size text,
  color text,
  condition text,
  price numeric(10, 2) not null check (price >= 1),
  shipping_price numeric(10, 2) not null default 0,
  photos jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'reserved', 'sold', 'removed')),
  -- While a buyer is on Stripe's checkout page, nobody else can buy the item.
  reserved_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, inventory_id)
);

create index if not exists sellsource_listings_active_idx on public.sellsource_listings (status, created_at desc);
create index if not exists sellsource_listings_handle_idx on public.sellsource_listings (handle, status);

alter table public.sellsource_listings enable row level security;

drop policy if exists "Listings are public" on public.sellsource_listings;
create policy "Listings are public" on public.sellsource_listings for select using (status <> 'removed' or auth.uid() = seller_id);
drop policy if exists "Sellers add their own listings" on public.sellsource_listings;
create policy "Sellers add their own listings" on public.sellsource_listings for insert with check (auth.uid() = seller_id);
-- Sellers edit their own listings but can't touch one that's sold or held for a buyer at checkout.
drop policy if exists "Sellers edit their own listings" on public.sellsource_listings;
create policy "Sellers edit their own listings" on public.sellsource_listings for update
  using (auth.uid() = seller_id and status in ('active', 'removed'))
  with check (auth.uid() = seller_id and status in ('active', 'removed'));

drop trigger if exists sellsource_listings_touch on public.sellsource_listings;
create trigger sellsource_listings_touch before update on public.sellsource_listings
  for each row execute function public.touch_updated_at();

-- ---------- Sales (one per Stripe checkout) ----------

create table if not exists public.sellsource_sales (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellsource_sellers (user_id) on delete cascade,
  listing_ids text[] not null,
  show_id text,
  -- The buyer's browser token, for combined shipping across a live show. Not personal data.
  buyer_token text not null,
  items_total numeric(10, 2) not null,
  shipping numeric(10, 2) not null,
  fees numeric(10, 2) not null,
  checkout_session text unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired')),
  order_id text,
  created_at timestamptz not null default now()
);

create index if not exists sellsource_sales_show_idx on public.sellsource_sales (show_id, buyer_token) where status = 'paid';

-- Only the Edge Functions read and write sales.
alter table public.sellsource_sales enable row level security;

-- ---------- Live shows ----------

create table if not exists public.live_shows (
  id text primary key,
  seller_id uuid not null references public.sellsource_sellers (user_id) on delete cascade default auth.uid(),
  handle text not null,
  shop_name text not null,
  title text not null check (char_length(title) between 1 and 80),
  starts_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended')),
  listing_ids jsonb not null default '[]'::jsonb,
  pinned_id text,
  -- {listingId, startingBid, endsAt} for the running or last auction.
  auction jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists live_shows_upcoming_idx on public.live_shows (status, starts_at);

alter table public.live_shows enable row level security;
drop policy if exists "Shows are public" on public.live_shows;
create policy "Shows are public" on public.live_shows for select using (true);
drop policy if exists "Sellers run their own shows" on public.live_shows;
create policy "Sellers run their own shows" on public.live_shows for all using (auth.uid() = seller_id) with check (auth.uid() = seller_id);

drop trigger if exists live_shows_touch on public.live_shows;
create trigger live_shows_touch before update on public.live_shows
  for each row execute function public.touch_updated_at();

create table if not exists public.live_bids (
  id uuid primary key default gen_random_uuid(),
  show_id text not null references public.live_shows (id) on delete cascade,
  listing_id text not null,
  name text not null check (char_length(name) between 1 and 30),
  amount numeric(10, 2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index if not exists live_bids_show_idx on public.live_bids (show_id, listing_id, amount desc);

-- Which browser placed each bid, so only the winner can pay. Never readable by anyone.
create table if not exists public.live_bid_tokens (
  bid_id uuid primary key references public.live_bids (id) on delete cascade,
  token text not null
);

alter table public.live_bids enable row level security;
alter table public.live_bid_tokens enable row level security;
drop policy if exists "Bids are public" on public.live_bids;
create policy "Bids are public" on public.live_bids for select using (true);

create table if not exists public.live_chat (
  id uuid primary key default gen_random_uuid(),
  show_id text not null references public.live_shows (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  body text not null check (char_length(body) between 1 and 200),
  host boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists live_chat_show_idx on public.live_chat (show_id, created_at desc);

alter table public.live_chat enable row level security;
drop policy if exists "Chat is public" on public.live_chat;
create policy "Chat is public" on public.live_chat for select using (true);
-- The host can remove a line from their own show.
drop policy if exists "Hosts remove chat" on public.live_chat;
create policy "Hosts remove chat" on public.live_chat for delete
  using (exists (select 1 from public.live_shows s where s.id = show_id and s.seller_id = auth.uid()));

-- ---------- Bidding and chat (anyone, checked here) ----------

-- Places a bid. Locks the show row so two bids at once are judged one after the other: the
-- auction must be open, the bid at least the minimum raise, and a bid in the last 10 seconds
-- puts 10 seconds back on the clock. Same rules as placeBid() in src/lib/sellsource.ts.
create or replace function public.live_place_bid(p_show text, p_listing text, p_name text, p_amount numeric, p_token text)
returns setof public.live_bids
language plpgsql security definer set search_path = public as $$
declare
  s public.live_shows;
  ends timestamptz;
  top numeric;
  step numeric;
  min_bid numeric;
  b public.live_bids;
begin
  if p_token is null or char_length(p_token) < 16 then raise exception 'Refresh the page and try again.'; end if;
  select * into s from public.live_shows where id = p_show for update;
  if not found or s.status <> 'live' or s.auction is null or s.auction->>'listingId' <> p_listing then
    raise exception 'This auction has ended.';
  end if;
  ends := (s.auction->>'endsAt')::timestamptz;
  if ends <= now() then raise exception 'This auction has ended.'; end if;
  select max(amount) into top from public.live_bids where show_id = p_show and listing_id = p_listing;
  if top is null then
    min_bid := (s.auction->>'startingBid')::numeric;
  else
    step := case when top < 25 then 1 when top < 100 then 2 when top < 250 then 5 else 10 end;
    min_bid := top + step;
  end if;
  if p_amount < min_bid then raise exception 'Bid at least $%.', min_bid; end if;
  if p_amount > min_bid * 10 + 100 then raise exception 'That bid looks like a typo.'; end if;

  insert into public.live_bids (show_id, listing_id, name, amount)
    values (p_show, p_listing, left(coalesce(nullif(trim(p_name), ''), 'Guest'), 30), p_amount)
    returning * into b;
  insert into public.live_bid_tokens (bid_id, token) values (b.id, p_token);

  if ends < now() + interval '10 seconds' then
    update public.live_shows
      set auction = jsonb_set(auction, '{endsAt}', to_jsonb(to_char((now() + interval '10 seconds') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
      where id = p_show;
  end if;
  return next b;
end $$;

create or replace function public.live_post_chat(p_show text, p_name text, p_text text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.live_shows;
begin
  select * into s from public.live_shows where id = p_show;
  if not found or s.status <> 'live' then raise exception 'Chat opens when the show is live.'; end if;
  if char_length(trim(coalesce(p_text, ''))) = 0 then return; end if;
  insert into public.live_chat (show_id, name, body, host)
    values (p_show, left(coalesce(nullif(trim(p_name), ''), 'Guest'), 30), left(trim(p_text), 200), auth.uid() is not null and auth.uid() = s.seller_id);
end $$;

grant execute on function public.live_place_bid(text, text, text, numeric, text) to anon, authenticated;
grant execute on function public.live_post_chat(text, text, text) to anon, authenticated;

-- ---------- Realtime: viewers get show, bid, chat and sale changes as they happen ----------

do $$
begin
  begin alter publication supabase_realtime add table public.live_shows; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.live_bids; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.live_chat; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.sellsource_listings; exception when duplicate_object then null; end;
exception when undefined_object then
  raise notice 'No supabase_realtime publication; live updates need Supabase Realtime.';
end $$;
