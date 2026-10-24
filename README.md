# Reship

A shipping dashboard for resellers: see sold orders from Poshmark, Vinted, Depop, Mercari, Whatnot, Etsy and eBay in one place, print the labels those marketplaces already generated (with SKUs and packing slips) in one batch, and track what has shipped. Built from the Reship design in Figma Make.

## Run it

```bash
npm install
npm run dev
```

Open the address it prints (usually http://localhost:5173).

Without any setup, Reship runs in **demo mode**: it starts with sample orders and saves everything in your browser only.

## Use real accounts and a shared database (Supabase)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the project's SQL editor, run the files in `supabase/migrations/` in order.
3. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Settings > API.
4. Restart `npm run dev`. Reship now asks you to sign in, and each account only sees its own orders.

## What works today

- Order dashboard from the design: status and marketplace filters, search, list and grid views, bundles, inline SKU editing
- Add and edit orders by hand, including buyer address and package weight
- Import orders from a marketplace CSV export, with automatic column matching and bundle grouping
- Upload each order's marketplace label PDF, one at a time or in bulk (files named with the order number are matched automatically)
- Print all selected labels in one PDF, optionally stamped with the SKUs, with a packing slip after each label (4x6, Letter or A4)
- Optional "Buy a different label" per order, with rate estimates for USPS, UPS and FedEx
- Settings saved per account: ship-from address, label format, default carrier
- Works on phones

## Coming next

Paid sign-up ($16.99/month), automatic order and label import, inventory tracking, real purchase of alternative labels, and returns.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app locally |
| `npm run build` | Typecheck and build for production into `dist/` |
| `npm test` | Run the tests |
