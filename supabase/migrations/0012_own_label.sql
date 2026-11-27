-- Labels bought through Reship for marketplaces that let sellers ship on their own (Mercari, Depop)
-- and for eBay, Etsy and direct sales: carrier, price paid and the marketplace price it was compared with.
alter table public.orders add column if not exists own_label jsonb;
