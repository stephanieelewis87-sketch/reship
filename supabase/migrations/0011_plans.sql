-- The five plans: Sell $12, Ship $25, Sync $35, Grow $50, Flow $100 a month. Each includes the ones before it.
-- Brings a database that already ran the older 0009 (Ship $9.99, Grow $49, Flow $109) up to date.
-- Safe to run more than once. Needs 0009.

-- Referred sellers can be on any of the five plans.
alter table public.referrals drop constraint if exists referrals_plan_check;
alter table public.referrals add constraint referrals_plan_check check (plan in ('sell', 'ship', 'sync', 'grow', 'flow'));

-- The first-month bonus is one month of the seller's plan, so its cap is the top plan's price.
alter table public.affiliate_program alter column bonus_cents set default 10000;
alter table public.affiliate_program alter column bonus_plans set default array['sell', 'ship', 'sync', 'grow', 'flow'];
update public.affiliate_program
  set bonus_cents = case when bonus_cents = 10900 then 10000 else bonus_cents end,
      bonus_plans = case when bonus_plans = array['ship', 'grow', 'flow'] then array['sell', 'ship', 'sync', 'grow', 'flow'] else bonus_plans end
  where id;
