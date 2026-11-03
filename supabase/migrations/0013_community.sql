-- Community: SellSync sellers post tips, questions and ideas, reply, and like each other's posts.
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
