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
