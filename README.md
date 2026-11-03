# SellSync

A shipping dashboard for resellers: see sold orders from Poshmark, Vinted, Depop, Mercari, Whatnot, Etsy and eBay in one place, print the labels those marketplaces already generated (with SKUs and packing slips) in one batch, and track what has shipped. Built from the SellSync design in Figma Make.

## Run it

```bash
npm install
npm run dev
```

Open the address it prints (usually http://localhost:5173).

Without any setup, SellSync runs in **demo mode**: it starts with sample orders and saves everything in your browser only.

## Use real accounts and a shared database (Supabase)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the project's SQL editor, run the files in `supabase/migrations/` in order (0004 adds inventory and profit tracking for Analytics, 0009 the affiliate program, 0011 the current plans).
3. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Settings > API.
4. Restart `npm run dev`. SellSync now asks you to sign in, and each account only sees its own orders.

## What works today

- Order dashboard from the design: status and marketplace filters, search, list and grid views, bundles, inline SKU editing
- Add and edit orders by hand, including buyer address and package weight
- Import orders from a marketplace CSV export, with automatic column matching and bundle grouping
- Poshmark orders and their prepaid labels come in automatically through the SellSync browser extension (see below)
- Upload an order's label PDF by hand from the order drawer when needed
- Print all selected labels in one PDF, optionally stamped with the SKUs, with a packing slip after each label (4x6, Letter or A4)
- Label helper per order, by marketplace: on Mercari and Depop orders, **Buy label** compares the marketplace's label price with SellSync's and, when SellSync's is cheaper, buys it and gives you the tracking number to paste into the marketplace. eBay, Etsy and direct sales always use a SellSync label. Poshmark, Whatnot and Vinted keep their prepaid label; SellSync shows it and never buys a second one
- Settings saved per account: ship-from address, label format, default carrier
- Works on phones
- **Analytics**: sales, true profit (after marketplace fees, shipping you paid and item cost), margin, days to sell, sell-through and money tied up in inventory, for any period and compared with the one before. Pages for profit (where the money went), marketplaces side by side, brands and categories, inventory health with suggested markdowns for stale listings, sourcing (which thrift stores pay off), a monthly profit goal, "what to do next" tips, and CSV reports for taxes. Click any point or row to see the sales behind it. Fees are estimated from each marketplace's fee schedule when an order doesn't say. The demo has a made-up year of sales so every page has something to show.

## Automatic SKUs and barcodes

- Every new item gets the next SKU automatically, like `BB-00042`. Pick the prefix and number of digits in Settings > SKUs and backups. SKUs are permanent: a number is never handed out twice, even after its item is deleted, and changing an item's SKU takes an extra click.
- Each SKU has a Code 128 barcode. Print SKU labels from an item's menu, from the item form, or for many items at once (select them, then SKU labels): 2.25 x 1.25" roll labels for Rollo, Dymo or Zebra printers, or Letter sheets of 30 (Avery 5160).
- Inventory > **Scan** finds an item by SKU or marketplace listing ID with any USB or Bluetooth barcode scanner, or with the camera in Chrome. It also sets where the item is stored, so putting items away is scan, type the bin, scan the next.
- Every item has a storage location (bin, shelf). Filter by it, search by it, set it in bulk, and it's printed on the SKU label.

## Views and watchers

Each item shows its views and watchers (likes, favorites or saves, in each marketplace's own word) from all its marketplaces as one small line in Inventory, with a per-marketplace breakdown and the change since the last reading when you click it. Sort by Most viewed or Most watched; turn the line off under Filter if you'd rather not see it. Items without numbers show nothing extra.

SellSync only gets these numbers in ways the marketplaces allow:

- **eBay**: Inventory > Sync > Import eBay views and watchers takes Seller Hub's listings traffic report (page views) and active listings download (watchers), matched to items by eBay item ID or listing link. eBay's official Analytics and Trading APIs have both numbers, for an automatic connection later.
- **Etsy**: typed in for now. Etsy's official API has listing views and favorites, so they can update on their own once SellSync's Etsy app key is approved.
- **Poshmark, Mercari, Depop, Vinted, Whatnot, Facebook Marketplace, ThredUp**: typed in from the listing (item menu > Views and watchers). None of them offers a seller API with these numbers, and SellSync doesn't scrape them.

The numbers are stored on each listing in the existing `listings` column, so no migration is needed.

## Inventory Guardian

Inventory > **Guardian** keeps the master record of every item safe. Run `supabase/migrations/0010_inventory_guardian.sql` to turn it on with accounts (demo mode keeps it in the browser).

- **Listing links**: each marketplace listing on an item can hold the marketplace's listing link or ID, so the item is the one master record those listings belong to.
- **Backups**: a dated copy of every item each day the app opens (the last 30 are kept), plus Back up now. Download any backup, or the current inventory, as a spreadsheet.
- **Listing checks**: duplicate SKUs, items without a SKU, one marketplace listing linked to two items, items that look entered twice (with one-click merge), open orders that match no item, sold items still listed elsewhere, and listings without a marketplace link.
- **Recovery**: pick a backup, see exactly which items would come back or change, untick any you don't want, and restore. A backup of how things were is made first. Restoring only changes SellSync's records; it never edits, relists or deletes anything on a marketplace.
- **Change history**: every edit, sale, bulk change, merge and restore is recorded per item (open an item, then History), and the latest changes show on the Guardian page.
- **Sync protection**: a change that would delete, delist, mark sold or overwrite 10 or more items at once (adjustable) is paused with a banner. Review it, drop it, or back up and apply it.

## Browser extension (marketplace sync)

Marketplaces don't offer label APIs, so the extension in `extension/` reads sold orders and labels using the seller's own logged-in browser session. It never asks for or stores marketplace passwords, and it shows an at-your-own-risk notice before it turns on.

- `node extension/build.mjs` builds it into `extension/dist` (it reads the same Supabase settings from `.env.local`).
- In Chrome, open `chrome://extensions`, turn on Developer mode, click Load unpacked and pick `extension/dist`.
- Sign in with your SellSync account, turn on a marketplace and press Sync now. It also syncs every 15 minutes.
- New seller setup checklist (also shown in the extension popup):
  1. Log in to each marketplace in the same Chrome profile that has the extension.
  2. Make sure Chrome isn't blocking third-party cookies. Go to Settings, then Privacy and security, then Third-party cookies, and choose "Allow third-party cookies" (or add each marketplace under "Allowed to use third-party cookies"). When they're blocked, marketplace pages such as Mercari may not load and syncs fail.
  3. Turn off ad or privacy blockers on marketplace sites.
- Poshmark and Mercari work today. Depop, Vinted and Whatnot show as "coming soon". The "Capture this page" and "Test" buttons help map and check a marketplace.
- Mercari's pages are drawn in the browser, so the extension reads them in a minimized window it opens and closes during a sync. Mercari's letter-size label is cut out and turned upright when printing on 4x6 labels.

## Bundle comments and buyer messages

Automations > **Comments and messages** helps sellers keep in touch, within each marketplace's rules:

- **Poshmark bundle comments**: pick a template (thanks for bundling, bundle offer coming, happy to help), fill in the shopper and items, then Copy and open Poshmark and post it on the shopper's bundle from My Shoppers.
- **Past buyers**: everyone who bought from you on a marketplace, with a template that fits where their order is (thanks, on its way, did it arrive). On Poshmark it opens the order page. A note about new items is allowed once a month per buyer, and a buyer can be marked "don't contact".
- **Potential buyers**: on Depop, Vinted, Facebook Marketplace and Whatnot, message people who liked or asked about an item. Poshmark, Mercari, eBay and Etsy don't allow messages to shoppers before they buy, and the page says so with a link to the rule.

SellSync never posts or sends for you: every marketplace here bans bots that comment or message. With the extension, a "SellSync templates" button appears in Poshmark and Depop comment boxes and types a template in; you press Post.

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

Inventory > **List with a video**: the seller films up to 25 items (up to 5 minutes), one after another. SellSync reads frames out of the video in the browser (the video itself is never uploaded), then:

1. Claude finds each distinct item and marks where it is in its clearest frame.
2. SellSync cuts snips of each item from the video.
3. Claude writes each listing from its snips: title, description, brand, category, size, color, condition, flaws, tags, and a suggested price with the usual sold range and a one-line reason. It also gets the seller's AI instructions from Settings and the median sold prices of their own most common brands and categories.
4. Optionally, an image model turns the best snip into a clean studio-style photo (it's told to keep the item exactly as it is, flaws included). The real snips are always kept with it.
5. The seller checks each draft, edits anything, and saves them as inventory drafts, ready to crosslist.

The same AI also powers **Generate listing** in the item form, from the photos already added.

Setup:

1. Run `supabase/migrations/0007_video_listing.sql` (a public `listing-photos` bucket and an `ai_usage` table for the daily cap).
2. Set secrets: `supabase secrets set ANTHROPIC_API_KEY=...` and, for clean AI photos, `OPENAI_API_KEY=...` (optional `IMAGE_MODEL`, default `gpt-image-1`). Without the OpenAI key everything else works and drafts use the snips.
3. Deploy: `supabase functions deploy video-listing`.
4. Optional daily caps per user: `VIDEO_LISTING_DAILY_VIDEOS` (20), `VIDEO_LISTING_DAILY_ITEMS` (600), `VIDEO_LISTING_DAILY_PHOTOS` (300).

In demo mode there's no AI: SellSync splits the video into items by scene and makes a draft with snips for each, for the seller to fill in.

## List from photos (AI)

Inventory > **List from photos**: the seller uploads up to 100 photos of up to 25 items at once (front, back, tags, flaws, in any order). Photos are read and shrunk in the browser; then:

1. Claude sorts the photos into one group per item and picks each item's cover (`group` action of the `video-listing` function). Close-ups of tags and flaws are matched to their item.
2. The seller checks the sorting: select photos, then move them to another item, a new item, or "Not used", and star a different cover. No listing is written until they press **Write listings**.
3. Each item's listing is written from up to 6 of its photos, the same way as List with a video (title, details, flaws, tags and a suggested price), with an optional clean AI photo (off by default here, since these are real photos).
4. The seller checks each draft and saves them as inventory drafts.

Setup is the same as List with a video, plus `supabase/migrations/0008_photo_listing.sql` (lets the daily cap count photo batches). Optional cap: `VIDEO_LISTING_DAILY_PHOTO_BATCHES` (20). Redeploy `video-listing`.

In demo mode there's no AI: SellSync groups photos by when they were taken (a long pause between shots starts a new item), or by how they look when the photos carry no times.

## Affiliates

Sellers earn **a referred seller's first month (Ship $9.99, Grow $49 or Flow $109), then 5% of every subscription payment that seller makes, for life**. The **Affiliates** tab (sidebar on computers, Settings on phones) has:

- **Join**: pick a referral code and how to be paid (PayPal, Venmo, Cash App, bank transfer). The link is `https://your-app/?ref=code`.
- **Overview**: the link with Copy and Share, money ready to pay, pending (held 30 days in case of refunds), paid so far, the monthly amount earned for life, link visits, sign-ups and paying sellers.
- **Referrals**: each referred seller (part of their email only), plan, status, whether the bonus is earned, and what they've earned the affiliate.
- **Earnings and payouts**: every earning with when it's ready, and every payout.
- **Pay affiliates** (app owner only): what each affiliate is owed, **Mark paid** after sending the money, and **Record payment** to credit a referred seller's subscription payment by hand until billing is connected.

A public page about the program, for sharing, is at `https://your-app/?affiliates`.

How referrals are tracked: a visit with `?ref=code` is counted and the code is remembered in that browser for 60 days. When that visitor signs up, they're credited to the affiliate. Self-referrals and accounts older than 7 days don't count, and a seller can only be referred once.

Setup: run `supabase/migrations/0009_affiliates.sql`. The terms live in the one-row `affiliate_program` table (bonus amount or cap, rate, refund hold, which plans earn the bonus, an optional "after they've paid this much" threshold, link memory, minimum payout); change them there and the app follows. By default the bonus equals the referred seller's first payment (one month of their plan), capped at $95 (one month of Flow), on any plan. Run `0011_plans.sql` too if you ran an older 0009. Set `bonus_matches_payment` to false for a flat `bonus_cents` instead.

When billing is built, its webhook calls these with the service role key: `record_subscription_payment(user_id, plan, amount_cents, invoice_id)` on every paid invoice (safe to repeat), `record_subscription_refund(invoice_id)` on a refund, and `record_subscription_canceled(user_id)` on a cancellation.
## Buying labels (EasyPost)

SellSync buys its own labels through EasyPost at EasyPost's discounted carrier rates, from the edge function in `supabase/functions/labels`.

1. Run `supabase/migrations/0012_own_label.sql`.
2. Create an EasyPost account and copy an API key (start with the test key, which makes free test labels).
3. `supabase secrets set EASYPOST_API_KEY=...` and `supabase functions deploy labels`.

Until the function is deployed, the app shows estimated prices and can't buy. In demo mode, buying makes a clearly marked practice label so the flow can be tried. Labels are paid from the EasyPost account, so charging sellers for them (or for the Ship plan) needs to be in place before using a live key.

## Coming next

Combining with Listy (video to listings) into one app: an inventory page, returns, expenses, Listy's video-to-listing flow, and sale prices and fees pulled in by the extension. Also paid sign-up ($16.99/month), QR code drop-off sheets, more marketplaces in the extension and real purchase of alternative labels.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app locally |
| `npm run build` | Typecheck and build for production into `dist/` |
| `npm test` | Run the tests |

## Plans

| Plan | Price | Adds |
| --- | --- | --- |
| Sell | $15/mo | Inventory manager, delisting, 20 new listings a day on up to 3 marketplaces (no AI) |
| Ship | $25/mo | Shipping labels (print, compare and buy, packing slips) |
| Sync | $50/mo | Crosslisting, up to 5 marketplaces, 30 listings a day, quantity sync after a sale |
| Grow | $65/mo | Automations, 40 listings a day |
| Flow | $95/mo | Unlimited listings and marketplaces, video listing, full AI, backup and restore |

Each plan includes the ones before it. Prices, features and limits live in `src/lib/plans.ts`; the homepage, Settings > Subscription, the upgrade prompts and the affiliate bonus all read from it. There's no billing yet: a seller picks a plan in Settings > Subscription, and everyone starts on Flow during early access.
