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
