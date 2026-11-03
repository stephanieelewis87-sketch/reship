-- Affiliate program: sellers share a referral link and earn a one-time bonus plus a share of what
-- the sellers they referred pay, for as long as those sellers stay subscribed.
-- Safe to run more than once. Needs 0006 (app_admins and is_app_admin).

-- The program's terms, one row. Change them here; the app reads them from this table.
--   bonus_cents             the one-time bonus per referred seller, or its cap (10900 = $109)
--   bonus_matches_payment   true: the bonus is the payment that earns it (one month of their plan:
--                           Ship $9.99, Grow $49, Flow $109), up to bonus_cents. false: always bonus_cents
--   rate                    share of every subscription payment, for life (0.05 = 5%)
--   hold_days               days a commission waits before it can be paid, so refunds can be taken back
--   bonus_plans             plans whose payment earns the bonus (ship, grow, flow)
--   bonus_after_paid_cents  the bonus waits until the referred seller has paid at least this much in total
--   cookie_days             how long a referral link is remembered in the browser before sign-up
--   min_payout_cents        smallest balance paid out
create table if not exists public.affiliate_program (
  id boolean primary key default true check (id),
  bonus_cents integer not null default 10900 check (bonus_cents >= 0),
  bonus_matches_payment boolean not null default true,
  rate numeric(5, 4) not null default 0.05 check (rate >= 0 and rate <= 1),
  hold_days integer not null default 30 check (hold_days >= 0),
  bonus_plans text[] not null default array['ship', 'grow', 'flow'],
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
  plan text check (plan in ('ship', 'grow', 'flow')),
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
