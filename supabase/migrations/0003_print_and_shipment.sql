-- When each label was last printed, and the shipping status the marketplace reports.
alter table public.orders add column if not exists printed_at timestamptz;
alter table public.orders add column if not exists shipment jsonb;
