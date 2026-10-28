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
2. In the project's SQL editor, run the files in `supabase/migrations/` in order (0004 adds inventory and profit tracking for Analytics).
3. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Settings > API.
4. Restart `npm run dev`. Reship now asks you to sign in, and each account only sees its own orders.

## What works today

- Order dashboard from the design: status and marketplace filters, search, list and grid views, bundles, inline SKU editing
- Add and edit orders by hand, including buyer address and package weight
- Import orders from a marketplace CSV export, with automatic column matching and bundle grouping
- Poshmark orders and their prepaid labels come in automatically through the Reship browser extension (see below)
- Upload an order's label PDF by hand from the order drawer when needed
- Print all selected labels in one PDF, optionally stamped with the SKUs, with a packing slip after each label (4x6, Letter or A4)
- Optional "Buy a different label" per order, with rate estimates for USPS, UPS and FedEx
- Settings saved per account: ship-from address, label format, default carrier
- Works on phones
- **Analytics**: sales, true profit (after marketplace fees, shipping you paid and item cost), margin, days to sell, sell-through and money tied up in inventory, for any period and compared with the one before. Pages for profit (where the money went), marketplaces side by side, brands and categories, inventory health with suggested markdowns for stale listings, sourcing (which thrift stores pay off), a monthly profit goal, "what to do next" tips, and CSV reports for taxes. Click any point or row to see the sales behind it. Fees are estimated from each marketplace's fee schedule when an order doesn't say. The demo has a made-up year of sales so every page has something to show.

## Browser extension (marketplace sync)

Marketplaces don't offer label APIs, so the extension in `extension/` reads sold orders and labels using the seller's own logged-in browser session. It never asks for or stores marketplace passwords, and it shows an at-your-own-risk notice before it turns on.

- `node extension/build.mjs` builds it into `extension/dist` (it reads the same Supabase settings from `.env.local`).
- In Chrome, open `chrome://extensions`, turn on Developer mode, click Load unpacked and pick `extension/dist`.
- Sign in with your Reship account, turn on a marketplace and press Sync now. It also syncs every 15 minutes.
- New seller setup checklist (also shown in the extension popup):
  1. Log in to each marketplace in the same Chrome profile that has the extension.
  2. Make sure Chrome isn't blocking third-party cookies. Go to Settings, then Privacy and security, then Third-party cookies, and choose "Allow third-party cookies" (or add each marketplace under "Allowed to use third-party cookies"). When they're blocked, marketplace pages such as Mercari may not load and syncs fail.
  3. Turn off ad or privacy blockers on marketplace sites.
- Poshmark and Mercari work today. Depop, Vinted and Whatnot show as "coming soon". The "Capture this page" and "Test" buttons help map and check a marketplace.
- Mercari's pages are drawn in the browser, so the extension reads them in a minimized window it opens and closes during a sync. Mercari's letter-size label is cut out and turned upright when printing on 4x6 labels.

## Coming next

Combining with Listy (video to listings) into one app: an inventory page, returns, expenses, Listy's video-to-listing flow, and sale prices and fees pulled in by the extension. Also paid sign-up ($16.99/month), QR code drop-off sheets, more marketplaces in the extension and real purchase of alternative labels.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app locally |
| `npm run build` | Typecheck and build for production into `dist/` |
| `npm test` | Run the tests |
