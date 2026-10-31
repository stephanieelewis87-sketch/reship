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

## Feedback summaries (AI)

Users send feedback from the Feedback tab. The `feedback-digest` Edge Function reads new feedback, asks Claude for a summary (themes, bugs, quick wins, decisions for you), saves it, and emails it to you. You read every summary under Feedback, then AI summaries.

1. Run `supabase/migrations/0006_feedback.sql`, then make yourself the owner:
   `insert into public.app_admins (user_id) select id from auth.users where email = 'you@example.com';`
2. Set the function's secrets: `supabase secrets set ANTHROPIC_API_KEY=... RESEND_API_KEY=... OWNER_EMAIL=you@example.com APP_URL=https://your-app` (optional: `FEEDBACK_FROM_EMAIL` once your sending domain is verified in Resend).
3. Deploy: `supabase functions deploy feedback-digest`.
4. Schedule it weekly with pg_cron and pg_net (SQL editor):
   ```sql
   select cron.schedule('feedback-digest', '0 14 * * 1', $$
     select net.http_post(
       url := 'https://<project-ref>.supabase.co/functions/v1/feedback-digest',
       headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>')
     ) $$);
   ```
   You can also press "Summarize now" in the app at any time.

## List with a video (AI)

Inventory > **List with a video**: the seller films up to 25 items (up to 5 minutes), one after another. Reship reads frames out of the video in the browser (the video itself is never uploaded), then:

1. Claude finds each distinct item and marks where it is in its clearest frame.
2. Reship cuts snips of each item from the video.
3. Claude writes each listing from its snips: title, description, brand, category, size, color, condition, flaws, tags, and a suggested price with the usual sold range and a one-line reason. It also gets the seller's AI instructions from Settings and the median sold prices of their own most common brands and categories.
4. Optionally, an image model turns the best snip into a clean studio-style photo (it's told to keep the item exactly as it is, flaws included). The real snips are always kept with it.
5. The seller checks each draft, edits anything, and saves them as inventory drafts, ready to crosslist.

The same AI also powers **Generate listing** in the item form, from the photos already added.

Setup:

1. Run `supabase/migrations/0007_video_listing.sql` (a public `listing-photos` bucket and an `ai_usage` table for the daily cap).
2. Set secrets: `supabase secrets set ANTHROPIC_API_KEY=...` and, for clean AI photos, `OPENAI_API_KEY=...` (optional `IMAGE_MODEL`, default `gpt-image-1`). Without the OpenAI key everything else works and drafts use the snips.
3. Deploy: `supabase functions deploy video-listing`.
4. Optional daily caps per user: `VIDEO_LISTING_DAILY_VIDEOS` (20), `VIDEO_LISTING_DAILY_ITEMS` (600), `VIDEO_LISTING_DAILY_PHOTOS` (300).

In demo mode there's no AI: Reship splits the video into items by scene and makes a draft with snips for each, for the seller to fill in.

## List from photos (AI)

Inventory > **List from photos**: the seller uploads up to 100 photos of up to 25 items at once (front, back, tags, flaws, in any order). Photos are read and shrunk in the browser; then:

1. Claude sorts the photos into one group per item and picks each item's cover (`group` action of the `video-listing` function). Close-ups of tags and flaws are matched to their item.
2. The seller checks the sorting: select photos, then move them to another item, a new item, or "Not used", and star a different cover. No listing is written until they press **Write listings**.
3. Each item's listing is written from up to 6 of its photos, the same way as List with a video (title, details, flaws, tags and a suggested price), with an optional clean AI photo (off by default here, since these are real photos).
4. The seller checks each draft and saves them as inventory drafts.

Setup is the same as List with a video, plus `supabase/migrations/0008_photo_listing.sql` (lets the daily cap count photo batches). Optional cap: `VIDEO_LISTING_DAILY_PHOTO_BATCHES` (20). Redeploy `video-listing`.

In demo mode there's no AI: Reship groups photos by when they were taken (a long pause between shots starts a new item), or by how they look when the photos carry no times.

## Coming next

Combining with Listy (video to listings) into one app: an inventory page, returns, expenses, Listy's video-to-listing flow, and sale prices and fees pulled in by the extension. Also paid sign-up ($16.99/month), QR code drop-off sheets, more marketplaces in the extension and real purchase of alternative labels.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app locally |
| `npm run build` | Typecheck and build for production into `dist/` |
| `npm test` | Run the tests |
