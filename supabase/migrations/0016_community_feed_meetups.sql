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
