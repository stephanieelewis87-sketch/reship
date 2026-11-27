-- Hubby database setup: every migration, 0001 to 0018, in order.
-- Paste all of this into Supabase > SQL Editor > New query and press Run.
-- Safe to run again on a database that already has some or all of it.
-- Made by `node scripts/build-setup-sql.mjs`; don't edit by hand.

-- ============================================================
-- 0001_orders_and_settings.sql
-- ============================================================

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

drop policy if exists "Users manage their own orders" on public.orders;
create policy "Users manage their own orders" on public.orders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own settings" on public.settings;
create policy "Users manage their own settings" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();
drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ============================================================
-- 0002_label_files.sql
-- ============================================================

-- Marketplace label PDFs. Each order can have one uploaded label, stored in a private bucket
-- under a folder named after the user's id, so people can only reach their own files.

alter table public.orders add column if not exists label jsonb;

insert into storage.buckets (id, name, public)
values ('labels', 'labels', false)
on conflict (id) do nothing;

drop policy if exists "Users read their own labels" on storage.objects;
create policy "Users read their own labels" on storage.objects
  for select using (bucket_id = 'labels' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users upload their own labels" on storage.objects;
create policy "Users upload their own labels" on storage.objects
  for insert with check (bucket_id = 'labels' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users replace their own labels" on storage.objects;
create policy "Users replace their own labels" on storage.objects
  for update using (bucket_id = 'labels' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete their own labels" on storage.objects;
create policy "Users delete their own labels" on storage.objects
  for delete using (bucket_id = 'labels' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- 0003_print_and_shipment.sql
-- ============================================================

-- When each label was last printed, and the shipping status the marketplace reports.
alter table public.orders add column if not exists printed_at timestamptz;
alter table public.orders add column if not exists shipment jsonb;

-- ============================================================
-- 0004_inventory_and_profit.sql
-- ============================================================

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
  listings jsonb not null default '[]'::jsonb,
  photo text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_items_user_sku_idx on public.inventory_items (user_id, sku);

alter table public.inventory_items enable row level security;

drop policy if exists "Users manage their own inventory" on public.inventory_items;
create policy "Users manage their own inventory" on public.inventory_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists inventory_items_touch on public.inventory_items;
create trigger inventory_items_touch before update on public.inventory_items
  for each row execute function public.touch_updated_at();

-- Business expenses for profit and loss.
create table if not exists public.expenses (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  expense_date date not null default current_date,
  category text not null default 'Other',
  amount numeric(10, 2) not null default 0,
  note text,
  miles numeric(10, 1),
  created_at timestamptz not null default now()
);

create index if not exists expenses_user_date_idx on public.expenses (user_id, expense_date desc);

alter table public.expenses enable row level security;

drop policy if exists "Users manage their own expenses" on public.expenses;
create policy "Users manage their own expenses" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- 0005_crosslist.sql
-- ============================================================

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

-- ============================================================
-- 0006_feedback.sql
-- ============================================================

-- User feedback, and the AI summaries the app owner reads to decide what to change.
-- 0005 belongs to crosslisting; this file only adds new tables.

-- Who can read everyone's feedback and the summaries. Add a row by hand for the owner:
--   insert into public.app_admins (user_id) select id from auth.users where email = 'you@example.com';
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.app_admins enable row level security;

drop policy if exists "Admins can see that they are admins" on public.app_admins;
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

drop policy if exists "Users send feedback" on public.feedback;
create policy "Users send feedback" on public.feedback
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users read their own feedback" on public.feedback;
create policy "Users read their own feedback" on public.feedback
  for select using (auth.uid() = user_id or public.is_app_admin());
drop policy if exists "Admins update feedback status" on public.feedback;
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

drop policy if exists "Admins read summaries" on public.feedback_summaries;
create policy "Admins read summaries" on public.feedback_summaries
  for select using (public.is_app_admin());

-- ============================================================
-- 0007_video_listing.sql
-- ============================================================

-- "List with a video": listing photos and a log of AI use for the daily cap.
-- 0004 to 0006 belong to other changes; this file only adds new things.

-- Listing photos are public so marketplaces and the browser extension can load them by address.
-- Each user writes only inside a folder named after their id.
insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', true)
on conflict (id) do nothing;

drop policy if exists "Users upload their own listing photos" on storage.objects;
create policy "Users upload their own listing photos" on storage.objects
  for insert with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users replace their own listing photos" on storage.objects;
create policy "Users replace their own listing photos" on storage.objects
  for update using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete their own listing photos" on storage.objects;
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

drop policy if exists "Users see their own AI use" on public.ai_usage;
create policy "Users see their own AI use" on public.ai_usage
  for select using (auth.uid() = user_id);

-- ============================================================
-- 0008_photo_listing.sql
-- ============================================================

-- "List from photos": the video-listing function gets a "group" action (sorting a batch of photos
-- into items), logged in ai_usage like the others for the daily cap.
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind in ('detect', 'group', 'describe', 'photo')) not valid;

-- ============================================================
-- 0009_affiliates.sql
-- ============================================================

-- Affiliate program: sellers share a referral link and earn a one-time bonus plus a share of what
-- the sellers they referred pay, for as long as those sellers stay subscribed.
-- Safe to run more than once. Needs 0006 (app_admins and is_app_admin).

-- The program's terms, one row. Change them here; the app reads them from this table.
--   bonus_cents             the one-time bonus per referred seller, or its cap (9500 = $95)
--   bonus_matches_payment   true: the bonus is the payment that earns it (one month of their plan:
--                           Sell $15, Ship $25, Sync $50, Grow $65, Flow $95), up to bonus_cents. false: always bonus_cents
--   rate                    share of every subscription payment, for life (0.05 = 5%)
--   hold_days               days a commission waits before it can be paid, so refunds can be taken back
--   bonus_plans             plans whose payment earns the bonus (sell, ship, sync, grow, flow)
--   bonus_after_paid_cents  the bonus waits until the referred seller has paid at least this much in total
--   cookie_days             how long a referral link is remembered in the browser before sign-up
--   min_payout_cents        smallest balance paid out
create table if not exists public.affiliate_program (
  id boolean primary key default true check (id),
  bonus_cents integer not null default 9500 check (bonus_cents >= 0),
  bonus_matches_payment boolean not null default true,
  rate numeric(5, 4) not null default 0.05 check (rate >= 0 and rate <= 1),
  hold_days integer not null default 30 check (hold_days >= 0),
  bonus_plans text[] not null default array['sell', 'ship', 'sync', 'grow', 'flow'],
  bonus_after_paid_cents integer not null default 0 check (bonus_after_paid_cents >= 0),
  cookie_days integer not null default 60 check (cookie_days > 0),
  min_payout_cents integer not null default 2500 check (min_payout_cents >= 0)
);
alter table public.affiliate_program add column if not exists bonus_matches_payment boolean not null default true;
insert into public.affiliate_program (id) values (true) on conflict (id) do nothing;

alter table public.affiliate_program enable row level security;
drop policy if exists "Anyone reads the affiliate terms" on public.affiliate_program;
create policy "Anyone reads the affiliate terms" on public.affiliate_program for select using (true);
drop policy if exists "Admins change the affiliate terms" on public.affiliate_program;
create policy "Admins change the affiliate terms" on public.affiliate_program
  for update using (public.is_app_admin()) with check (public.is_app_admin());

-- One row per seller who joined the program.
create table if not exists public.affiliates (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9-]{2,23}$'),
  payout_method text not null default 'paypal' check (payout_method in ('paypal', 'venmo', 'cashapp', 'bank', 'other')),
  payout_to text check (char_length(payout_to) <= 200),
  status text not null default 'active' check (status in ('active', 'paused', 'banned')),
  clicks integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.affiliates enable row level security;
drop policy if exists "Affiliates see themselves" on public.affiliates;
create policy "Affiliates see themselves" on public.affiliates
  for select using (auth.uid() = user_id or public.is_app_admin());
drop policy if exists "Sellers join the program" on public.affiliates;
create policy "Sellers join the program" on public.affiliates
  for insert with check (auth.uid() = user_id and status = 'active' and clicks = 0);
drop policy if exists "Affiliates edit their payout details" on public.affiliates;
create policy "Affiliates edit their payout details" on public.affiliates
  for update using (auth.uid() = user_id or public.is_app_admin()) with check (auth.uid() = user_id or public.is_app_admin());

-- Affiliates may change their code and payout details, but not their status or click count.
create or replace function public.affiliates_guard() returns trigger
  language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_app_admin() then
    new.status := old.status;
    new.clicks := old.clicks;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists affiliates_guard on public.affiliates;
create trigger affiliates_guard before update on public.affiliates for each row execute function public.affiliates_guard();

-- One row per seller who signed up through someone's link. A seller can only be referred once.
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates (user_id) on delete cascade,
  referred_user_id uuid not null unique references auth.users (id) on delete cascade,
  -- What the affiliate sees instead of the email, such as "st•••@gmail.com".
  referred_label text not null default 'A seller',
  plan text check (plan in ('sell', 'ship', 'sync', 'grow', 'flow')),
  status text not null default 'signed_up' check (status in ('signed_up', 'paying', 'canceled')),
  total_paid_cents integer not null default 0,
  bonus_earned boolean not null default false,
  first_paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists referrals_affiliate_idx on public.referrals (affiliate_id, created_at desc);

alter table public.referrals enable row level security;
drop policy if exists "Affiliates see their referrals" on public.referrals;
create policy "Affiliates see their referrals" on public.referrals
  for select using (auth.uid() = affiliate_id or public.is_app_admin());

-- What the program owes. Admins pay them out in batches.
create table if not exists public.affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates (user_id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  method text not null,
  reference text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.affiliate_payouts enable row level security;
drop policy if exists "Affiliates see their payouts" on public.affiliate_payouts;
create policy "Affiliates see their payouts" on public.affiliate_payouts
  for select using (auth.uid() = affiliate_id or public.is_app_admin());

create table if not exists public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates (user_id) on delete cascade,
  referral_id uuid not null references public.referrals (id) on delete cascade,
  kind text not null check (kind in ('bonus', 'recurring')),
  amount_cents integer not null check (amount_cents >= 0),
  -- The subscription payment this came from (for example a Stripe invoice id), so a payment is never counted twice.
  payment_ref text not null,
  payment_cents integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'paid', 'void')),
  available_at timestamptz not null,
  payout_id uuid references public.affiliate_payouts (id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (payment_ref, kind)
);
create index if not exists affiliate_commissions_affiliate_idx on public.affiliate_commissions (affiliate_id, created_at desc);

alter table public.affiliate_commissions enable row level security;
drop policy if exists "Affiliates see their commissions" on public.affiliate_commissions;
create policy "Affiliates see their commissions" on public.affiliate_commissions
  for select using (auth.uid() = affiliate_id or public.is_app_admin());

-- Counts a visit to a referral link. Anyone can call it, signed in or not.
create or replace function public.record_referral_click(p_code text) returns void
  language sql security definer set search_path = public as $$
  update public.affiliates set clicks = clicks + 1 where code = lower(trim(p_code)) and status = 'active';
$$;
revoke all on function public.record_referral_click(text) from public;
grant execute on function public.record_referral_click(text) to anon, authenticated;

-- Called by a newly signed-up seller who arrived through a referral link. Returns true when the
-- referral was recorded. Ignores self-referrals, unknown codes, and accounts older than 7 days
-- (so existing users can't attach themselves to an affiliate later).
create or replace function public.claim_referral(p_code text) returns boolean
  language plpgsql security definer set search_path = public as $$
declare
  v_affiliate uuid;
  v_email text;
  v_created timestamptz;
  v_label text;
begin
  if auth.uid() is null then return false; end if;
  select user_id into v_affiliate from public.affiliates where code = lower(trim(p_code)) and status = 'active';
  if v_affiliate is null or v_affiliate = auth.uid() then return false; end if;
  select email, created_at into v_email, v_created from auth.users where id = auth.uid();
  if v_created < now() - interval '7 days' then return false; end if;
  v_label := case
    when v_email is null or position('@' in v_email) = 0 then 'A seller'
    else left(v_email, 2) || '•••' || substr(v_email, position('@' in v_email))
  end;
  insert into public.referrals (affiliate_id, referred_user_id, referred_label)
  values (v_affiliate, auth.uid(), v_label)
  on conflict (referred_user_id) do nothing;
  return found;
end $$;
revoke all on function public.claim_referral(text) from public;
grant execute on function public.claim_referral(text) to authenticated;

-- Records one subscription payment by a seller and earns the affiliate who referred them their
-- share (and the one-time bonus when it's due). The billing webhook calls this with the service
-- role key; until billing exists, an admin can record payments from the app. Calling it again with
-- the same payment_ref does nothing. Returns the cents earned.
create or replace function public.record_subscription_payment(p_user uuid, p_plan text, p_amount_cents integer, p_payment_ref text)
  returns integer
  language plpgsql security definer set search_path = public as $$
declare
  t public.affiliate_program;
  r public.referrals;
  v_status text;
  v_available timestamptz;
  v_earned integer := 0;
  v_share integer;
  v_bonus integer;
begin
  if not (public.is_app_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Only the billing service or an admin can record payments';
  end if;
  if p_amount_cents <= 0 or coalesce(trim(p_payment_ref), '') = '' then
    raise exception 'A payment needs a positive amount and a reference';
  end if;
  select * into t from public.affiliate_program where id;
  select * into r from public.referrals where referred_user_id = p_user for update;
  if r.id is null then return 0; end if;
  if exists (select 1 from public.affiliate_commissions where payment_ref = p_payment_ref and kind = 'recurring') then return 0; end if;
  select status into v_status from public.affiliates where user_id = r.affiliate_id;

  update public.referrals
    set plan = coalesce(lower(p_plan), plan),
        status = 'paying',
        total_paid_cents = total_paid_cents + p_amount_cents,
        first_paid_at = coalesce(first_paid_at, now())
    where id = r.id
    returning * into r;

  if v_status = 'banned' then return 0; end if;
  v_available := now() + make_interval(days => t.hold_days);
  v_share := round(p_amount_cents * t.rate);
  insert into public.affiliate_commissions (affiliate_id, referral_id, kind, amount_cents, payment_ref, payment_cents, available_at)
  values (r.affiliate_id, r.id, 'recurring', v_share, p_payment_ref, p_amount_cents, v_available);
  v_earned := v_share;

  v_bonus := case when t.bonus_matches_payment then least(p_amount_cents, t.bonus_cents) else t.bonus_cents end;
  if not r.bonus_earned and lower(p_plan) = any (t.bonus_plans) and r.total_paid_cents >= t.bonus_after_paid_cents and v_bonus > 0 then
    insert into public.affiliate_commissions (affiliate_id, referral_id, kind, amount_cents, payment_ref, payment_cents, available_at)
    values (r.affiliate_id, r.id, 'bonus', v_bonus, p_payment_ref, p_amount_cents, v_available);
    update public.referrals set bonus_earned = true where id = r.id;
    v_earned := v_earned + v_bonus;
  end if;
  return v_earned;
end $$;
revoke all on function public.record_subscription_payment(uuid, text, integer, text) from public;
grant execute on function public.record_subscription_payment(uuid, text, integer, text) to authenticated, service_role;

-- A refunded payment takes back anything it earned that hasn't been paid out yet. A refunded bonus
-- can be earned again by a later payment.
create or replace function public.record_subscription_refund(p_payment_ref text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_app_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Only the billing service or an admin can record refunds';
  end if;
  update public.referrals set bonus_earned = false
    where id in (select referral_id from public.affiliate_commissions where payment_ref = p_payment_ref and kind = 'bonus' and status = 'pending');
  update public.referrals rf set total_paid_cents = greatest(0, rf.total_paid_cents - c.payment_cents)
    from public.affiliate_commissions c
    where c.referral_id = rf.id and c.payment_ref = p_payment_ref and c.kind = 'recurring' and c.status <> 'void';
  update public.affiliate_commissions set status = 'void' where payment_ref = p_payment_ref and status = 'pending';
end $$;
revoke all on function public.record_subscription_refund(text) from public;
grant execute on function public.record_subscription_refund(text) to authenticated, service_role;

-- The billing webhook calls this when a referred seller cancels.
create or replace function public.record_subscription_canceled(p_user uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_app_admin() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Only the billing service or an admin can record cancellations';
  end if;
  update public.referrals set status = 'canceled' where referred_user_id = p_user;
end $$;
revoke all on function public.record_subscription_canceled(uuid) from public;
grant execute on function public.record_subscription_canceled(uuid) to authenticated, service_role;

-- Every affiliate with what they're owed, for the admin's payout list.
create or replace function public.admin_affiliate_balances()
  returns table (
    affiliate_id uuid, email text, code text, payout_method text, payout_to text, status text, clicks integer,
    referrals bigint, paying bigint, pending_cents bigint, available_cents bigint, paid_cents bigint
  )
  language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'Admins only'; end if;
  return query
  select a.user_id, u.email::text, a.code, a.payout_method, a.payout_to, a.status, a.clicks,
    (select count(*) from public.referrals r where r.affiliate_id = a.user_id),
    (select count(*) from public.referrals r where r.affiliate_id = a.user_id and r.status = 'paying'),
    coalesce((select sum(c.amount_cents) from public.affiliate_commissions c where c.affiliate_id = a.user_id and c.status = 'pending' and c.available_at > now()), 0)::bigint,
    coalesce((select sum(c.amount_cents) from public.affiliate_commissions c where c.affiliate_id = a.user_id and c.status = 'pending' and c.available_at <= now()), 0)::bigint,
    coalesce((select sum(c.amount_cents) from public.affiliate_commissions c where c.affiliate_id = a.user_id and c.status = 'paid'), 0)::bigint
  from public.affiliates a join auth.users u on u.id = a.user_id
  order by 11 desc, a.created_at;
end $$;
revoke all on function public.admin_affiliate_balances() from public;
grant execute on function public.admin_affiliate_balances() to authenticated;

-- Marks everything an affiliate can be paid as paid, after the admin sends the money (PayPal,
-- Venmo, bank transfer...). Returns the payout id, or null when nothing was due.
create or replace function public.admin_record_payout(p_affiliate uuid, p_method text, p_reference text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_total integer;
  v_id uuid;
begin
  if not public.is_app_admin() then raise exception 'Admins only'; end if;
  select coalesce(sum(amount_cents), 0) into v_total from public.affiliate_commissions
    where affiliate_id = p_affiliate and status = 'pending' and available_at <= now();
  if v_total <= 0 then return null; end if;
  insert into public.affiliate_payouts (affiliate_id, amount_cents, method, reference)
    values (p_affiliate, v_total, p_method, nullif(trim(p_reference), '')) returning id into v_id;
  update public.affiliate_commissions set status = 'paid', paid_at = now(), payout_id = v_id
    where affiliate_id = p_affiliate and status = 'pending' and available_at <= now();
  return v_id;
end $$;
revoke all on function public.admin_record_payout(uuid, text, text) from public;
grant execute on function public.admin_record_payout(uuid, text, text) to authenticated;

-- ============================================================
-- 0010_inventory_guardian.sql
-- ============================================================

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

drop policy if exists "Users manage their own inventory backups" on public.inventory_backups;
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
drop policy if exists "Users read their own inventory history" on public.inventory_history;
create policy "Users read their own inventory history" on public.inventory_history
  for select using (auth.uid() = user_id);
drop policy if exists "Users add to their own inventory history" on public.inventory_history;
create policy "Users add to their own inventory history" on public.inventory_history
  for insert with check (auth.uid() = user_id);

-- ============================================================
-- 0011_plans.sql
-- ============================================================

-- The five plans: Sell $15, Ship $25, Sync $50, Grow $65, Flow $95 a month. Each includes the ones before it.
-- Brings a database that already ran the older 0009 (Ship $9.99, Grow $49, Flow $109) or an earlier draft of these plans up to date.
-- Safe to run more than once. Needs 0009.

-- Referred sellers can be on any of the five plans.
alter table public.referrals drop constraint if exists referrals_plan_check;
alter table public.referrals add constraint referrals_plan_check check (plan in ('sell', 'ship', 'sync', 'grow', 'flow'));

-- The first-month bonus is one month of the seller's plan, so its cap is the top plan's price.
alter table public.affiliate_program alter column bonus_cents set default 9500;
alter table public.affiliate_program alter column bonus_plans set default array['sell', 'ship', 'sync', 'grow', 'flow'];
update public.affiliate_program
  set bonus_cents = case when bonus_cents in (10900, 10000) then 9500 else bonus_cents end,
      bonus_plans = case when bonus_plans in (array['ship', 'grow', 'flow'], array['sell', 'ship', 'grow', 'flow']) then array['sell', 'ship', 'sync', 'grow', 'flow'] else bonus_plans end
  where id;

-- ============================================================
-- 0012_own_label.sql
-- ============================================================

-- Labels bought through Reship for marketplaces that let sellers ship on their own (Mercari, Depop)
-- and for eBay, Etsy and direct sales: carrier, price paid and the marketplace price it was compared with.
alter table public.orders add column if not exists own_label jsonb;

-- ============================================================
-- 0012_research_comps.sql
-- ============================================================

-- Research tab: live comps searches (comps-search Edge Function) count toward a daily cap per user,
-- logged in ai_usage like the AI listing calls. Saved research lives in each user's settings row.
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind in ('detect', 'group', 'describe', 'photo', 'comps')) not valid;

-- ============================================================
-- 0013_assistant.sql
-- ============================================================

-- The AI helper (assistant Edge Function): each question counts toward a daily cap per user,
-- logged in ai_usage like the AI listing calls and comps searches. Safe to run more than once. Needs 0012_research_comps.
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind in ('detect', 'group', 'describe', 'photo', 'comps', 'assistant')) not valid;

-- ============================================================
-- 0014_community.sql
-- ============================================================

-- Community: Hubby sellers post tips, questions and ideas, reply, and like each other's posts.
-- Moderation: anyone can report a post or reply, and three reports hide it until an admin looks;
-- admins (app_admins, from 0006) remove or restore posts and replies and can ban someone from
-- posting; anyone can block a seller so they stop seeing that seller's posts and replies.
-- Safe to run more than once. Needs 0006 (app_admins and is_app_admin).

-- ---------- Tables ----------

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  author_name text not null check (char_length(author_name) between 1 and 60),
  category text not null default 'tips' check (category in ('tips', 'questions', 'shipping', 'sourcing', 'wins', 'news', 'ideas', 'chat')),
  title text not null check (char_length(title) between 3 and 140),
  body text not null check (char_length(body) between 1 and 10000),
  like_count integer not null default 0,
  reply_count integer not null default 0,
  last_activity_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_reason text,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists community_posts_recent_idx on public.community_posts (created_at desc);
create index if not exists community_posts_activity_idx on public.community_posts (last_activity_at desc);
create index if not exists community_posts_user_idx on public.community_posts (user_id);

create table if not exists public.community_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  author_name text not null check (char_length(author_name) between 1 and 60),
  body text not null check (char_length(body) between 1 and 5000),
  like_count integer not null default 0,
  removed_at timestamptz,
  removed_reason text,
  created_at timestamptz not null default now()
);

create index if not exists community_replies_post_idx on public.community_replies (post_id, created_at);

-- One like per person per post or reply. target_id is the post's or reply's id.
create table if not exists public.community_likes (
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('post', 'reply')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, target_id)
);

create index if not exists community_likes_target_idx on public.community_likes (kind, target_id);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('post', 'reply')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'harassment', 'scam', 'off_topic', 'other')),
  note text check (char_length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'removed', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (reporter_id, kind, target_id)
);

create index if not exists community_reports_open_idx on public.community_reports (created_at desc) where status = 'open';

-- A seller's own block list: the blocked seller's posts and replies disappear for them.
create table if not exists public.community_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  blocked_id uuid not null references auth.users (id) on delete cascade,
  blocked_name text not null default '',
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- Sellers an admin has banned from posting and replying. They can still read.
create table if not exists public.community_bans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  user_name text not null default '',
  reason text,
  banned_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- Helpers ----------

create or replace function public.community_is_banned(p_user uuid default auth.uid()) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from public.community_bans where user_id = p_user) $$;

create or replace function public.community_has_blocked(p_author uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from public.community_blocks where blocker_id = auth.uid() and blocked_id = p_author) $$;

-- ---------- Row-level security ----------

alter table public.community_posts enable row level security;
alter table public.community_replies enable row level security;
alter table public.community_likes enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_blocks enable row level security;
alter table public.community_bans enable row level security;

drop policy if exists "Signed-in sellers read posts" on public.community_posts;
create policy "Signed-in sellers read posts" on public.community_posts
  for select to authenticated using (
    public.is_app_admin()
    or auth.uid() = user_id
    or (removed_at is null and not public.community_has_blocked(user_id))
  );
drop policy if exists "Sellers post as themselves" on public.community_posts;
create policy "Sellers post as themselves" on public.community_posts
  for insert to authenticated with check (auth.uid() = user_id and removed_at is null and not public.community_is_banned());
drop policy if exists "Sellers edit their own posts" on public.community_posts;
create policy "Sellers edit their own posts" on public.community_posts
  for update to authenticated using (auth.uid() = user_id and not public.community_is_banned()) with check (auth.uid() = user_id);
drop policy if exists "Sellers delete their own posts" on public.community_posts;
create policy "Sellers delete their own posts" on public.community_posts
  for delete to authenticated using (auth.uid() = user_id or public.is_app_admin());

-- Authors can change only the words and the category; counts and removal stay with the database.
revoke update on public.community_posts from authenticated, anon;
grant update (title, body, category, edited_at) on public.community_posts to authenticated;

drop policy if exists "Signed-in sellers read replies" on public.community_replies;
create policy "Signed-in sellers read replies" on public.community_replies
  for select to authenticated using (
    public.is_app_admin()
    or auth.uid() = user_id
    or (removed_at is null and not public.community_has_blocked(user_id))
  );
drop policy if exists "Sellers reply as themselves" on public.community_replies;
create policy "Sellers reply as themselves" on public.community_replies
  for insert to authenticated with check (
    auth.uid() = user_id and removed_at is null and not public.community_is_banned()
    and exists (select 1 from public.community_posts p where p.id = post_id and p.removed_at is null)
  );
drop policy if exists "Sellers delete their own replies" on public.community_replies;
create policy "Sellers delete their own replies" on public.community_replies
  for delete to authenticated using (auth.uid() = user_id or public.is_app_admin());
revoke update on public.community_replies from authenticated, anon;

drop policy if exists "Sellers see their own likes" on public.community_likes;
create policy "Sellers see their own likes" on public.community_likes
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Sellers like as themselves" on public.community_likes;
create policy "Sellers like as themselves" on public.community_likes
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Sellers take back their likes" on public.community_likes;
create policy "Sellers take back their likes" on public.community_likes
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Sellers report as themselves" on public.community_reports;
create policy "Sellers report as themselves" on public.community_reports
  for insert to authenticated with check (auth.uid() = reporter_id and status = 'open');
drop policy if exists "Sellers see their reports, admins see all" on public.community_reports;
create policy "Sellers see their reports, admins see all" on public.community_reports
  for select to authenticated using (auth.uid() = reporter_id or public.is_app_admin());

drop policy if exists "Sellers manage their block list" on public.community_blocks;
create policy "Sellers manage their block list" on public.community_blocks
  for all to authenticated using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

drop policy if exists "Banned sellers and admins see bans" on public.community_bans;
create policy "Banned sellers and admins see bans" on public.community_bans
  for select to authenticated using (auth.uid() = user_id or public.is_app_admin());
drop policy if exists "Admins ban" on public.community_bans;
create policy "Admins ban" on public.community_bans
  for insert to authenticated with check (public.is_app_admin());
drop policy if exists "Admins lift bans" on public.community_bans;
create policy "Admins lift bans" on public.community_bans
  for delete to authenticated using (public.is_app_admin());

-- ---------- Counts, kept by the database so nobody can inflate them ----------

create or replace function public.community_like_counts() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  delta integer := case when tg_op = 'INSERT' then 1 else -1 end;
  v_kind text;
  v_target uuid;
begin
  if tg_op = 'INSERT' then v_kind := new.kind; v_target := new.target_id;
  else v_kind := old.kind; v_target := old.target_id;
  end if;
  if v_kind = 'post' then
    update public.community_posts set like_count = greatest(0, like_count + delta) where id = v_target;
  else
    update public.community_replies set like_count = greatest(0, like_count + delta) where id = v_target;
  end if;
  return null;
end $$;

drop trigger if exists community_like_counts on public.community_likes;
create trigger community_like_counts after insert or delete on public.community_likes
  for each row execute function public.community_like_counts();

create or replace function public.community_reply_counts() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.community_posts set reply_count = reply_count + 1, last_activity_at = now() where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.community_posts set reply_count = greatest(0, reply_count - 1) where id = old.post_id;
  end if;
  return null;
end $$;

drop trigger if exists community_reply_counts on public.community_replies;
create trigger community_reply_counts after insert or delete on public.community_replies
  for each row execute function public.community_reply_counts();

-- Three open reports from different sellers hide a post or reply until an admin decides.
create or replace function public.community_auto_hide() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.community_reports where kind = new.kind and target_id = new.target_id and status = 'open') >= 3 then
    if new.kind = 'post' then
      update public.community_posts set removed_at = now(), removed_reason = 'Hidden after 3 reports, waiting for review' where id = new.target_id and removed_at is null;
    else
      update public.community_replies set removed_at = now(), removed_reason = 'Hidden after 3 reports, waiting for review' where id = new.target_id and removed_at is null;
    end if;
  end if;
  return null;
end $$;

drop trigger if exists community_auto_hide on public.community_reports;
create trigger community_auto_hide after insert on public.community_reports
  for each row execute function public.community_auto_hide();

-- ---------- Admin actions ----------

-- p_action: 'remove' hides the post or reply, 'restore' brings it back, 'dismiss' keeps it up.
-- Any of them closes the open reports on it.
create or replace function public.community_moderate(p_kind text, p_id uuid, p_action text, p_reason text default null) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'Admins only'; end if;
  if p_kind not in ('post', 'reply') or p_action not in ('remove', 'restore', 'dismiss') then raise exception 'Unknown moderation action'; end if;
  if p_action = 'remove' then
    if p_kind = 'post' then
      update public.community_posts set removed_at = now(), removed_reason = coalesce(p_reason, 'Removed by a moderator') where id = p_id;
    else
      update public.community_replies set removed_at = now(), removed_reason = coalesce(p_reason, 'Removed by a moderator') where id = p_id;
    end if;
  else
    if p_kind = 'post' then
      update public.community_posts set removed_at = null, removed_reason = null where id = p_id;
    else
      update public.community_replies set removed_at = null, removed_reason = null where id = p_id;
    end if;
  end if;
  update public.community_reports
    set status = case when p_action = 'remove' then 'removed' else 'dismissed' end, resolved_at = now()
    where kind = p_kind and target_id = p_id and status = 'open';
end $$;

revoke all on function public.community_moderate(text, uuid, text, text) from public;
grant execute on function public.community_moderate(text, uuid, text, text) to authenticated;

-- Open reports grouped by post or reply, with the words that were reported, for the admin's queue.
create or replace function public.community_report_queue()
returns table (kind text, target_id uuid, post_id uuid, author_id uuid, author_name text, title text, body text,
               removed_at timestamptz, report_count bigint, reasons text[], notes text[], first_reported_at timestamptz)
  language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'Admins only'; end if;
  return query
    select r.kind, r.target_id,
           coalesce(p.id, rp.post_id),
           coalesce(p.user_id, rp.user_id),
           coalesce(p.author_name, rp.author_name),
           coalesce(p.title, pp.title),
           coalesce(p.body, rp.body),
           coalesce(p.removed_at, rp.removed_at),
           count(*), array_agg(distinct r.reason), array_remove(array_agg(r.note), null), min(r.created_at)
    from public.community_reports r
    left join public.community_posts p on r.kind = 'post' and p.id = r.target_id
    left join public.community_replies rp on r.kind = 'reply' and rp.id = r.target_id
    left join public.community_posts pp on pp.id = rp.post_id
    where r.status = 'open' and (p.id is not null or rp.id is not null)
    group by r.kind, r.target_id, p.id, p.user_id, p.author_name, p.title, p.body, p.removed_at,
             rp.post_id, rp.user_id, rp.author_name, rp.body, rp.removed_at, pp.title
    order by count(*) desc, min(r.created_at);
end $$;

revoke all on function public.community_report_queue() from public;
grant execute on function public.community_report_queue() to authenticated;

-- ============================================================
-- 0015_sellsource_and_live.sql
-- ============================================================

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

-- ============================================================
-- 0016_community_feed_meetups.sql
-- ============================================================

-- The Hubby group: a feed with emoji reactions and optional headlines, and in-person meetups
-- people plan together (time, place, spots, RSVPs and a discussion, which is the post's comments).
-- Safe to run more than once. Needs 0014 (the Community tables).

-- ---------- Posts: optional headline, a Meetups topic, reaction counts ----------

alter table public.community_posts drop constraint if exists community_posts_title_check;
alter table public.community_posts add constraint community_posts_title_check check (char_length(title) <= 140);
alter table public.community_posts alter column title set default '';

alter table public.community_posts drop constraint if exists community_posts_category_check;
alter table public.community_posts add constraint community_posts_category_check
  check (category in ('tips', 'questions', 'shipping', 'sourcing', 'wins', 'news', 'ideas', 'chat', 'meetups'));

-- Counts by emoji, kept by the database: {"like": 4, "love": 2}. like_count stays the total.
alter table public.community_posts add column if not exists reactions jsonb not null default '{}'::jsonb;

-- ---------- Reactions: one per person per post, any of five emoji ----------

alter table public.community_likes add column if not exists reaction text not null default 'like';
alter table public.community_likes drop constraint if exists community_likes_reaction_check;
alter table public.community_likes add constraint community_likes_reaction_check
  check (reaction in ('like', 'love', 'haha', 'wow', 'yay') and (kind = 'post' or reaction = 'like'));

-- Changing your reaction is an update of your own row (only the emoji can change).
drop policy if exists "Sellers change their reaction" on public.community_likes;
create policy "Sellers change their reaction" on public.community_likes
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke update on public.community_likes from authenticated, anon;
grant update (reaction) on public.community_likes to authenticated;

create or replace function public.community_bump_reaction(p_post uuid, p_reaction text, p_delta integer) returns void
  language sql security definer set search_path = public as $$
  update public.community_posts
    set reactions = case
      when coalesce((reactions ->> p_reaction)::integer, 0) + p_delta <= 0 then reactions - p_reaction
      else jsonb_set(reactions, array[p_reaction], to_jsonb(coalesce((reactions ->> p_reaction)::integer, 0) + p_delta))
    end
    where id = p_post
$$;
revoke all on function public.community_bump_reaction(uuid, text, integer) from public, authenticated, anon;

create or replace function public.community_like_counts() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.kind = 'post' then
      update public.community_posts set like_count = like_count + 1 where id = new.target_id;
      perform public.community_bump_reaction(new.target_id, new.reaction, 1);
    else
      update public.community_replies set like_count = like_count + 1 where id = new.target_id;
    end if;
  elsif tg_op = 'DELETE' then
    if old.kind = 'post' then
      update public.community_posts set like_count = greatest(0, like_count - 1) where id = old.target_id;
      perform public.community_bump_reaction(old.target_id, old.reaction, -1);
    else
      update public.community_replies set like_count = greatest(0, like_count - 1) where id = old.target_id;
    end if;
  elsif tg_op = 'UPDATE' and new.reaction is distinct from old.reaction and new.kind = 'post' then
    perform public.community_bump_reaction(old.target_id, old.reaction, -1);
    perform public.community_bump_reaction(new.target_id, new.reaction, 1);
  end if;
  return null;
end $$;

drop trigger if exists community_like_counts on public.community_likes;
create trigger community_like_counts after insert or delete or update of reaction on public.community_likes
  for each row execute function public.community_like_counts();

-- Likes from before reactions existed count as 👍.
update public.community_posts p
  set reactions = jsonb_build_object('like', p.like_count)
  where p.reactions = '{}'::jsonb and p.like_count > 0;

-- ---------- Meetups ----------

create table if not exists public.community_meetups (
  post_id uuid primary key references public.community_posts (id) on delete cascade,
  host_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  starts_at timestamptz not null,
  ends_at timestamptz,
  place_name text not null check (char_length(place_name) between 1 and 120),
  address text not null default '' check (char_length(address) <= 300),
  capacity integer check (capacity between 2 and 500),
  cancelled_at timestamptz,
  going_count integer not null default 0,
  maybe_count integer not null default 0,
  created_at timestamptz not null default now(),
  check (ends_at is null or (ends_at > starts_at and ends_at - starts_at <= interval '3 days'))
);

create index if not exists community_meetups_starts_idx on public.community_meetups (starts_at);

create table if not exists public.community_rsvps (
  post_id uuid not null references public.community_meetups (post_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  user_name text not null check (char_length(user_name) between 1 and 60),
  status text not null check (status in ('going', 'maybe')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists community_rsvps_user_idx on public.community_rsvps (user_id);

alter table public.community_meetups enable row level security;
alter table public.community_rsvps enable row level security;

-- You can see a meetup when you can see its post (hidden posts and blocked hosts stay hidden).
drop policy if exists "Sellers see meetups they can see the post of" on public.community_meetups;
create policy "Sellers see meetups they can see the post of" on public.community_meetups
  for select to authenticated using (exists (select 1 from public.community_posts p where p.id = post_id));
drop policy if exists "Hosts add a meetup to their own post" on public.community_meetups;
create policy "Hosts add a meetup to their own post" on public.community_meetups
  for insert to authenticated with check (
    auth.uid() = host_id and cancelled_at is null and going_count = 0 and maybe_count = 0
    and not public.community_is_banned()
    and exists (select 1 from public.community_posts p where p.id = post_id and p.user_id = auth.uid() and p.category = 'meetups')
  );
drop policy if exists "Hosts edit their meetup" on public.community_meetups;
create policy "Hosts edit their meetup" on public.community_meetups
  for update to authenticated using (auth.uid() = host_id and not public.community_is_banned()) with check (auth.uid() = host_id);
revoke update on public.community_meetups from authenticated, anon;
grant update (starts_at, ends_at, place_name, address, capacity, cancelled_at) on public.community_meetups to authenticated;

drop policy if exists "Sellers see who's going" on public.community_rsvps;
create policy "Sellers see who's going" on public.community_rsvps
  for select to authenticated using (
    auth.uid() = user_id
    or (exists (select 1 from public.community_meetups m where m.post_id = community_rsvps.post_id)
        and not public.community_has_blocked(user_id))
  );
drop policy if exists "Sellers RSVP as themselves" on public.community_rsvps;
create policy "Sellers RSVP as themselves" on public.community_rsvps
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Sellers change their RSVP" on public.community_rsvps;
create policy "Sellers change their RSVP" on public.community_rsvps
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Sellers take back their RSVP" on public.community_rsvps;
create policy "Sellers take back their RSVP" on public.community_rsvps
  for delete to authenticated using (auth.uid() = user_id);
revoke update on public.community_rsvps from authenticated, anon;
grant update (status, user_name) on public.community_rsvps to authenticated;

-- RSVPs are refused for hidden, cancelled, past or full meetups. Row locks on the meetup keep two
-- people from taking the last spot at once.
create or replace function public.community_rsvp_check() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  m public.community_meetups%rowtype;
  v_removed timestamptz;
begin
  select * into m from public.community_meetups where post_id = new.post_id for update;
  if not found then raise exception 'This meetup isn''t available.'; end if;
  select removed_at into v_removed from public.community_posts where id = new.post_id;
  if v_removed is not null or m.cancelled_at is not null then raise exception 'This meetup was cancelled.'; end if;
  if coalesce(m.ends_at, m.starts_at + interval '3 hours') < now() then raise exception 'This meetup already happened.'; end if;
  if new.status = 'going' and m.capacity is not null
     and (tg_op = 'INSERT' or old.status <> 'going')
     and m.going_count >= m.capacity then
    raise exception 'This meetup is full. You can say Maybe in case a spot opens up.';
  end if;
  return new;
end $$;

drop trigger if exists community_rsvp_check on public.community_rsvps;
create trigger community_rsvp_check before insert or update on public.community_rsvps
  for each row execute function public.community_rsvp_check();

create or replace function public.community_rsvp_counts() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_post uuid := coalesce(new.post_id, old.post_id);
begin
  update public.community_meetups set
    going_count = (select count(*) from public.community_rsvps where post_id = v_post and status = 'going'),
    maybe_count = (select count(*) from public.community_rsvps where post_id = v_post and status = 'maybe')
    where post_id = v_post;
  update public.community_posts set last_activity_at = now() where id = v_post and tg_op <> 'DELETE';
  return null;
end $$;

drop trigger if exists community_rsvp_counts on public.community_rsvps;
create trigger community_rsvp_counts after insert or update or delete on public.community_rsvps
  for each row execute function public.community_rsvp_counts();

-- Make the post and its meetup in one go, and RSVP the host as going. Runs as the caller, so the
-- row-level security rules above still apply.
create or replace function public.community_create_meetup(
  p_author_name text, p_title text, p_body text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_place_name text, p_address text, p_capacity integer
) returns uuid
  language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
begin
  if p_starts_at < now() then raise exception 'Pick a time that hasn''t passed yet.'; end if;
  if char_length(trim(p_title)) < 3 then raise exception 'Give the meetup a name (3 characters or more).'; end if;
  insert into public.community_posts (user_id, author_name, category, title, body)
    values (auth.uid(), p_author_name, 'meetups', trim(p_title), coalesce(nullif(trim(p_body), ''), trim(p_title)))
    returning id into v_id;
  insert into public.community_meetups (post_id, host_id, starts_at, ends_at, place_name, address, capacity)
    values (v_id, auth.uid(), p_starts_at, p_ends_at, trim(p_place_name), coalesce(trim(p_address), ''), p_capacity);
  insert into public.community_rsvps (post_id, user_id, user_name, status) values (v_id, auth.uid(), p_author_name, 'going');
  return v_id;
end $$;

revoke all on function public.community_create_meetup(text, text, text, timestamptz, timestamptz, text, text, integer) from public;
grant execute on function public.community_create_meetup(text, text, text, timestamptz, timestamptz, text, text, integer) to authenticated;

-- ============================================================
-- 0016_waitlist.sql
-- ============================================================

-- Hubby coming soon page: the early access waitlist.
-- Visitors are not signed in, so they never touch the table directly. They call two functions:
--   join_waitlist(email, source, referrer)          adds the email (joining twice is fine)
--   update_waitlist_answers(email, marketplaces, stage)  saves the two optional questions
-- Nobody can read the list through the API except app admins (see 0006_feedback.sql).
-- This file is safe to run more than once.

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  marketplaces text[] not null default '{}',
  stage text check (stage in ('starting', 'under_1_year', '1_to_3_years', '3_plus_years')),
  source text,
  referrer text,
  invited_at timestamptz,
  created_at timestamptz not null default now()
);

-- One row per email, whatever its capitalization.
create unique index if not exists waitlist_email_key on public.waitlist (lower(email));
create index if not exists waitlist_created_idx on public.waitlist (created_at);

alter table public.waitlist enable row level security;

-- Only admins can see or edit the list (for example to mark people invited).
drop policy if exists "Admins read the waitlist" on public.waitlist;
create policy "Admins read the waitlist" on public.waitlist
  for select using (public.is_app_admin());
drop policy if exists "Admins update the waitlist" on public.waitlist;
create policy "Admins update the waitlist" on public.waitlist
  for update using (public.is_app_admin()) with check (public.is_app_admin());

create or replace function public.join_waitlist(p_email text, p_source text default null, p_referrer text default null)
  returns void
  language plpgsql security definer set search_path = public as
$$
declare
  v_email text := lower(trim(p_email));
begin
  if v_email is null or char_length(v_email) > 254
     or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  insert into public.waitlist (email, source, referrer)
  values (v_email, left(p_source, 100), left(p_referrer, 300))
  on conflict ((lower(email))) do nothing;
end;
$$;

create or replace function public.update_waitlist_answers(p_email text, p_marketplaces text[] default '{}', p_stage text default null)
  returns void
  language plpgsql security definer set search_path = public as
$$
declare
  allowed text[] := array['poshmark', 'mercari', 'ebay', 'depop', 'etsy', 'whatnot', 'vinted', 'facebook', 'other'];
begin
  if p_stage is not null and p_stage not in ('starting', 'under_1_year', '1_to_3_years', '3_plus_years') then
    raise exception 'invalid_stage' using errcode = '22023';
  end if;

  update public.waitlist
     set marketplaces = coalesce(
           (select array_agg(distinct m) from unnest(coalesce(p_marketplaces, '{}')) m where m = any (allowed)),
           '{}'),
         stage = p_stage
   where lower(email) = lower(trim(p_email));
end;
$$;

-- Signed-out visitors use the publishable (anon) key, so they need to be able to call these.
revoke all on function public.join_waitlist(text, text, text) from public;
revoke all on function public.update_waitlist_answers(text, text[], text) from public;
grant execute on function public.join_waitlist(text, text, text) to anon, authenticated;
grant execute on function public.update_waitlist_answers(text, text[], text) to anon, authenticated;

-- Handy for the owner, in the SQL editor:
--   select count(*) from public.waitlist;
--   select email, marketplaces, stage, created_at from public.waitlist order by created_at;

-- ============================================================
-- 0017_marketplace_connections.sql
-- ============================================================

-- Official marketplace connections (eBay first). The seller signs in on the marketplace's own
-- page and approves Hubby; the marketplace gives Hubby a token. Hubby never sees a password.
-- Tokens are secrets: only the `ebay` Edge Function (service role) can read or write these tables.
-- Row level security is on with no policies, so the app's browser key can't touch them.

create table if not exists public.marketplace_connections (
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,
  external_user text,               -- the seller's username on the marketplace
  access_token text,
  access_expires_at timestamptz,
  refresh_token text not null,
  refresh_expires_at timestamptz,
  scopes text not null default '',
  connected_at timestamptz not null default now(),
  last_import_at timestamptz,
  primary key (user_id, platform)
);

create index if not exists marketplace_connections_external_idx on public.marketplace_connections (platform, external_user);

-- One-time codes that tie the marketplace's "approved" redirect back to the Hubby account that
-- started it. They expire after 15 minutes.
create table if not exists public.oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,
  return_url text,
  created_at timestamptz not null default now()
);

alter table public.marketplace_connections enable row level security;
alter table public.oauth_states enable row level security;

-- ============================================================
-- 0018_receipts.sql
-- ============================================================

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
