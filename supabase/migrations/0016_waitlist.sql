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
