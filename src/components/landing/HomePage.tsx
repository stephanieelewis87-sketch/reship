import { useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { ArrowRight, BarChart3, Boxes, Check, ChevronDown, Gift, Menu, Printer, Radio, ScanLine, ShoppingBag, Sparkles, Store, X } from "lucide-react";
import type { Platform } from "@/lib/types";
import { MARKETPLACES as MARKETPLACE_INFO } from "@/lib/marketplaces";
import { PlatformIcon } from "../ui";
import { Logo as BrandLogo, MISSION, SellSyncMark, SellSyncWordmark, TAGLINE } from "../brand/Logo";
import { MISSION_HREF, minPriceLabel } from "@/lib/minPrice";

// The homepage only promises what Hubby does today. Orders and labels sync automatically from
// these marketplaces; the others come in from a CSV export or by hand.
const SYNCED: Platform[] = ["Poshmark", "Mercari"];
const BY_CSV: Platform[] = ["eBay", "Depop", "Etsy", "Facebook"];

// Public homepage shown before sign-in. onSignIn/onSignUp open the account screen; demoHref opens
// the demo with sample data.
export function HomePage({ onSignIn, onSignUp, demoHref = "/?demo" }: { onSignIn: () => void; onSignUp: () => void; demoHref?: string }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <NavBar onSignIn={onSignIn} onSignUp={onSignUp} />
      <main>
        <Hero onSignUp={onSignUp} demoHref={demoHref} />
        <MarketplaceStrip />
        <FeaturePillars />
        <FeatureLabels />
        <FeatureInventory />
        <FeatureProfit />
        <SellSyncSection />
        <HowItWorks />
        <EarlyAccess onSignUp={onSignUp} />
        <Faq />
        <FinalCta onSignUp={onSignUp} demoHref={demoHref} />
      </main>
      <Footer onSignIn={onSignIn} />
    </div>
  );
}

const ctaPrimary =
  "inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent/90 transition-colors shadow-sm";
const ctaSecondary =
  "inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full border border-border bg-card text-foreground text-sm font-semibold hover:border-accent/50 hover:text-accent transition-colors";

function Logo() {
  return (
    <a href="#top" className="flex items-center gap-2.5" aria-label="Hubby">
      <BrandLogo />
    </a>
  );
}

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#sellsync", label: "SellSync" },
  { href: "#how", label: "How it works" },
  { href: "#early", label: "Early access" },
  { href: "#faq", label: "FAQ" },
  { href: MISSION_HREF, label: "Mission" },
];

function NavBar({ onSignIn, onSignUp }: { onSignIn: () => void; onSignUp: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 bg-background/85 backdrop-blur border-b border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-foreground transition-colors">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-2">
          <button onClick={onSignIn} className="px-4 py-2 text-sm text-foreground hover:text-accent">
            Sign in
          </button>
          <button onClick={onSignUp} className={`${ctaPrimary} !py-2`}>
            Get started
          </button>
        </div>
        <button className="md:hidden p-2 -mr-2" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-border bg-background px-4 py-4 space-y-1">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-2 text-sm">
              {l.label}
            </a>
          ))}
          <div className="flex gap-2 pt-3">
            <button onClick={onSignIn} className={`${ctaSecondary} flex-1 !py-2.5`}>
              Sign in
            </button>
            <button onClick={onSignUp} className={`${ctaPrimary} flex-1 !py-2.5`}>
              Get started
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-semibold tracking-wide">
      {children}
    </span>
  );
}

function Hero({ onSignUp, demoHref }: { onSignUp: () => void; demoHref: string }) {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="absolute inset-0 -z-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,rgba(181,96,122,0.16),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(243,238,233,1),transparent_60%)]" />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-16 md:pt-20 md:pb-24 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <Eyebrow>
            <Sparkles className="w-3.5 h-3.5" /> {TAGLINE} Now in early access.
          </Eyebrow>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-medium leading-[1.05] mt-5 tracking-tight">
            Every label in one print.
            <br />
            Every item in its place.
            <br />
            <span className="text-accent">Every dollar counted.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-md">
            Hubby is the hub for your whole reselling business, and the helpful other half your shop has been missing. It prints all your
            marketplace labels in one batch, keeps track of every item and the bin it lives in, and shows your true profit after fees, shipping
            and what you paid.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <button onClick={onSignUp} className={ctaPrimary}>
              Get started <ArrowRight className="w-4 h-4" />
            </button>
            <a href={demoHref} className={ctaSecondary}>
              Try the live demo
            </a>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">No marketplace passwords needed. Works on your phone.</p>
        </div>
        <HeroVisual />
      </div>
    </section>
  );
}

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-md h-[420px] sm:h-[460px]">
      <div className="absolute left-0 top-6 w-[56%] rotate-[-4deg]">
        <ItemCard className="shadow-xl" />
      </div>
      <div className="absolute right-0 top-0 w-[52%] rotate-[3deg]">
        <ProfitCard className="shadow-xl" />
      </div>
      <div className="absolute right-6 bottom-0 w-[42%] rotate-[-2deg]">
        <LabelCard sku="DN-0412" carrier="USPS Ground Advantage" className="shadow-xl" />
        <div className="absolute -top-3 -left-3 px-2.5 py-1 rounded-full bg-foreground text-background text-[12px] font-semibold flex items-center gap-1">
          <Printer className="w-3 h-3" /> 12 labels, 1 click
        </div>
      </div>
    </div>
  );
}

// A sample inventory item: SKU, bin, cost and its barcode label.
function ItemCard({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-card border border-border rounded-2xl p-4 ${className}`}>
      <div className="aspect-[4/3] rounded-xl bg-gradient-to-br from-accent/20 to-secondary flex items-center justify-center">
        <Boxes className="w-8 h-8 text-accent/70" />
      </div>
      <p className="font-medium text-sm mt-3">Levi's 501 denim jacket</p>
      <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[12px] text-muted-foreground">
        <span className="font-mono">DN-0412</span>
        <span className="px-1.5 rounded bg-accent/10 text-accent font-medium">Bin 4</span>
        <span>paid $8</span>
      </div>
      <div className="mt-3 h-7 flex items-end gap-[2px] overflow-hidden" aria-hidden>
        {Array.from({ length: 30 }).map((_, i) => (
          <span key={i} className="bg-foreground h-full shrink-0" style={{ width: (i * 5) % 3 === 0 ? 3 : 1 }} />
        ))}
      </div>
    </div>
  );
}

// A sample sale broken down into true profit.
function ProfitCard({ className = "" }: { className?: string }) {
  const rows: [string, string][] = [
    ["Sold for", "$48.00"],
    ["Marketplace fees", "-$9.60"],
    ["Shipping you paid", "$0.00"],
    ["What you paid", "-$8.00"],
  ];
  return (
    <div className={`bg-card border border-border rounded-2xl p-4 ${className}`}>
      <p className="text-[12px] uppercase tracking-wider text-muted-foreground">True profit</p>
      <p className="font-display text-3xl mt-1 text-emerald-700">$30.40</p>
      <dl className="mt-3 space-y-1 text-[12px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function MarketplaceChip({ p }: { p: Platform }) {
  return (
    <span className="flex items-center gap-2 text-sm font-medium text-foreground/80">
      <PlatformIcon platform={p} className="w-4 h-4" />
      {MARKETPLACE_INFO[p].name}
    </span>
  );
}

function MarketplaceStrip() {
  return (
    <section className="border-y border-border bg-card/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 grid md:grid-cols-2 gap-5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <p className="w-full text-xs uppercase tracking-wider text-muted-foreground">Orders and labels sync automatically</p>
          {SYNCED.map((p) => (
            <MarketplaceChip key={p} p={p} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <p className="w-full text-xs uppercase tracking-wider text-muted-foreground">Bring in sales from a CSV export</p>
          {BY_CSV.map((p) => (
            <MarketplaceChip key={p} p={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

const PILLARS: { icon: ComponentType<{ className?: string }>; title: string; body: string; href: string }[] = [
  {
    icon: Printer,
    title: "Labels in one print",
    body: "Every sold order's label in one PDF, stamped with your SKU and followed by a packing slip. 4x6, Letter or A4.",
    href: "#labels",
  },
  {
    icon: ScanLine,
    title: "Inventory that knows where things are",
    body: "Every item gets a SKU barcode label and a bin or shelf. Scan or search it to find it, move it, or see what it cost.",
    href: "#inventory",
  },
  {
    icon: BarChart3,
    title: "True profit",
    body: "See what you really made on each item after marketplace fees, shipping and what you paid, with a CSV ready for tax time.",
    href: "#profit",
  },
];

function FeaturePillars() {
  return (
    <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
      <div className="text-center max-w-2xl mx-auto">
        <Eyebrow>What Hubby does today</Eyebrow>
        <h2 className="font-serif text-3xl sm:text-4xl font-medium mt-4">Shipping, inventory and money, in one place</h2>
        <p className="mt-4 text-muted-foreground">Fewer tabs, no more printing labels one at a time, and no more guessing what you actually made.</p>
      </div>
      <div className="mt-12 grid md:grid-cols-3 gap-5">
        {PILLARS.map((p) => (
          <a
            key={p.title}
            href={p.href}
            className="group bg-card border border-border rounded-2xl p-6 hover:border-accent/40 hover:shadow-lg transition-all"
          >
            <span className="w-11 h-11 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
              <p.icon className="w-5 h-5" />
            </span>
            <h3 className="font-display text-xl font-medium mt-5">{p.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{p.body}</p>
            <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-accent">
              See how <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

function FeatureRow({
  id,
  eyebrow,
  title,
  body,
  points,
  visual,
  flip = false,
  tint = false,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  visual: ReactNode;
  flip?: boolean;
  tint?: boolean;
}) {
  return (
    <section id={id} className={`scroll-mt-16 ${tint ? "bg-secondary/60" : ""}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 grid md:grid-cols-2 gap-12 items-center">
        <div className={flip ? "md:order-2" : ""}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="font-serif text-3xl sm:text-4xl font-medium mt-4 leading-tight">{title}</h2>
          <p className="mt-4 text-muted-foreground text-lg">{body}</p>
          <ul className="mt-6 space-y-3">
            {points.map((pt) => (
              <li key={pt} className="flex gap-3 text-sm">
                <span className="mt-0.5 w-5 h-5 rounded-full bg-accent text-accent-foreground flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3" />
                </span>
                {pt}
              </li>
            ))}
          </ul>
        </div>
        <div className={flip ? "md:order-1" : ""}>{visual}</div>
      </div>
    </section>
  );
}

function FeatureLabels() {
  const [printed, setPrinted] = useState(false);
  return (
    <FeatureRow
      id="labels"
      eyebrow="Easy shipping labels"
      title="Every label you owe, printed in one click."
      body="Hubby collects the prepaid labels your marketplaces already made for each sale, so there is nothing to buy or retype. Print the whole day in one go."
      points={[
        "One PDF for every marketplace's labels, sized for 4x6, Letter or A4",
        "Your SKU stamped on each label so you grab the right item",
        "A packing slip printed after each label, bundles included",
        "Poshmark and Mercari labels come in by themselves through the Hubby extension",
      ]}
      visual={
        <div className="max-w-sm mx-auto">
          <div className="relative h-80">
            {[2, 1, 0].map((i) => (
              <div
                key={i}
                className="absolute left-1/2 top-0 w-52 transition-transform duration-500"
                style={{ transform: `translate(calc(-50% + ${(printed ? (i - 1) * 40 : i * 6) - 6}px), ${printed ? i * 10 : i * 8}px) rotate(${(i - 1) * (printed ? 6 : 2)}deg)` }}
              >
                <LabelCard
                  sku={["DN-0412", "SW-0198", "BG-0730"][i]}
                  carrier={["USPS Ground Advantage", "USPS Priority Mail", "UPS Ground"][i]}
                  className="shadow-lg"
                />
              </div>
            ))}
          </div>
          <button onClick={() => setPrinted(!printed)} className={`${ctaPrimary} w-full mt-4`}>
            <Printer className="w-4 h-4" /> {printed ? "Printed 12 labels. Print again?" : "Print 12 labels"}
          </button>
        </div>
      }
    />
  );
}

function LabelCard({ sku, carrier, className = "" }: { sku: string; carrier: string; className?: string }) {
  return (
    <div className={`bg-white text-[#1C1017] border border-[#1C1017]/15 rounded-lg p-3 aspect-[4/5] flex flex-col ${className}`}>
      <div className="flex items-center justify-between border-b-2 border-[#1C1017] pb-1.5">
        <span className="font-bold text-sm">{carrier.split(" ")[0]}</span>
        <span className="text-[10px] text-right leading-tight">{carrier.split(" ").slice(1).join(" ")}</span>
      </div>
      <div className="mt-2 text-[10px] leading-snug">
        <p className="text-[9px] text-[#1C1017]/60">SHIP TO</p>
        <p className="font-semibold">J. Buyer</p>
        <p>1234 Example St, Apt 5</p>
        <p>Portland, OR 97201</p>
      </div>
      <div className="mt-auto">
        <div className="h-10 flex items-end gap-[2px]">
          {Array.from({ length: 38 }).map((_, i) => (
            <span key={i} className="bg-[#1C1017] h-full" style={{ width: (i * 7) % 3 === 0 ? 3 : 1 }} />
          ))}
        </div>
        <p className="font-mono text-[9px] mt-1 tracking-widest">9400 1000 0000 0000 0000 00</p>
        <span className="mt-1.5 inline-block px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-mono text-[10px]">SKU {sku}</span>
      </div>
    </div>
  );
}

function FeatureInventory() {
  return (
    <FeatureRow
      id="inventory"
      eyebrow="Inventory"
      title="Know what you have, and where it is."
      body="Add an item once with its photo, cost, size and bin. Print a SKU barcode label for it, then scan or search it later to pull it up in a second."
      points={[
        "Automatic SKUs that never repeat, with barcode labels to print",
        "Bin and shelf locations, so packing an order means grabbing, not searching",
        "Scan a label with a barcode scanner (or your phone camera on Android) to find or move an item",
        "A record of where each item is listed, and a reminder when something sold but is still up elsewhere",
      ]}
      visual={<ItemCard className="max-w-xs mx-auto shadow-lg" />}
      flip
      tint
    />
  );
}

function FeatureProfit() {
  return (
    <FeatureRow
      id="profit"
      eyebrow="Money"
      title="What you really made, item by item."
      body="Hubby takes out each marketplace's fees, the shipping you paid and what you paid for the item, so the number you see is the number you keep."
      points={[
        "Profit, margin and days to sell for any period",
        "Marketplaces, brands and sourcing spots side by side",
        "Business expenses next to your sales",
        "CSV reports to hand to whoever does your taxes",
      ]}
      visual={<ProfitCard className="max-w-xs mx-auto shadow-lg" />}
    />
  );
}

const STEPS = [
  { title: "Add the extension", body: "Install the Hubby browser extension and stay logged in to Poshmark and Mercari. We never ask for your passwords." },
  { title: "Bring in your items", body: "Add items by hand or import your listings, give each one a bin, and print SKU labels." },
  { title: "Ship and see your profit", body: "Print the day's labels in one batch, then see what each sale really made you." },
];

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-16 bg-foreground text-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <h2 className="font-serif text-3xl sm:text-4xl font-medium text-center">Up and running in minutes</h2>
        <ol className="mt-12 grid md:grid-cols-3 gap-8">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="font-display text-5xl text-accent">{i + 1}</span>
              <h3 className="text-lg font-semibold mt-3">{s.title}</h3>
              <p className="text-sm text-background/70 mt-2 leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// No plans or payments yet: Hubby is in early access. Pricing comes back once billing works.
function EarlyAccess({ onSignUp }: { onSignUp: () => void }) {
  return (
    <section id="early" className="scroll-mt-16 max-w-6xl mx-auto px-4 sm:px-6 py-20">
      <div className="rounded-3xl border border-border bg-secondary/60 px-5 sm:px-10 py-12 text-center">
        <Eyebrow>Early access</Eyebrow>
        <h2 className="font-serif text-3xl sm:text-4xl font-medium mt-4">Join while we're building it with sellers</h2>
        <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
          Hubby is in early access, and no payment is needed to try it. Your feedback decides what we build next.
        </p>
        <button type="button" onClick={onSignUp} className={`${ctaPrimary} mt-8`}>
          Get early access <ArrowRight className="w-4 h-4" />
        </button>
        <div className="mt-10 max-w-2xl mx-auto flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/5 px-5 py-4 text-sm text-left">
          <Gift className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <p>
            <span className="font-semibold">Every item lists at {minPriceLabel} or more.</span> Smaller items sell well bundled together or as a free gift with
            another item.{" "}
            <a href={MISSION_HREF} className="text-accent font-medium hover:underline">
              Why we have a minimum
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}

const FAQS = [
  {
    q: "Do I have to give Hubby my marketplace passwords?",
    a: "No. The Hubby browser extension works through the marketplace accounts you're already logged in to in Chrome, so your passwords stay with you.",
  },
  {
    q: "Which marketplaces work?",
    a: "Poshmark and Mercari orders and labels sync automatically today. You can bring in sales from eBay, Depop, Etsy, Facebook Marketplace and others with a CSV export, and automatic sync for more marketplaces is on the way.",
  },
  {
    q: "Do I have to buy labels through Hubby?",
    a: "No. Hubby prints the prepaid labels your marketplaces already made for each sale. You can also upload a label you bought somewhere else.",
  },
  {
    q: "What label sizes can I print?",
    a: "4x6 thermal labels, US Letter and A4. Hubby crops and rotates marketplace labels to fit, and can add a packing slip after each one.",
  },
  {
    q: "Does Hubby post my listings to marketplaces?",
    a: "Not yet. Today Hubby keeps the record of where each item is listed and reminds you when something sold but is still up elsewhere. Posting for you is on the way.",
  },
  {
    q: `Why is there a ${minPriceLabel} minimum price?`,
    a: `A seller's labor is not free. Very low-priced items leave nothing for the work behind them, clog the shipping channels and the marketplaces, and undervalue quality brands. Every item listed through Hubby is priced at ${minPriceLabel} or more. Read more on our Mission page.`,
  },
  {
    q: "Does it work on my phone?",
    a: "Yes. Hubby works in your phone's browser. Scanning SKU labels with the camera works on Android today, and iPhone support is on the way.",
  },
];

function Faq() {
  return (
    <section id="faq" className="scroll-mt-16 bg-secondary/60">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20">
        <h2 className="font-serif text-3xl sm:text-4xl font-medium text-center">Questions, answered</h2>
        <div className="mt-10 space-y-3">
          {FAQS.map((f) => (
            <details key={f.q} className="group bg-card border border-border rounded-xl px-5 py-4">
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-medium">
                {f.q}
                <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground group-open:rotate-180 transition-transform" />
              </summary>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta({ onSignUp, demoHref }: { onSignUp: () => void; demoHref: string }) {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
      <div className="rounded-3xl bg-accent text-accent-foreground px-6 py-14 sm:px-12 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.18),transparent_45%)]" />
        <p className="relative text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Our mission</p>
        <h2 className="relative mt-3 font-display text-3xl sm:text-4xl font-medium max-w-3xl mx-auto">{MISSION}</h2>
        <p className="relative mt-4 text-white/85 max-w-xl mx-auto">
          No experience needed. Hubby ships in one batch, finds every item fast and knows your real profit, so you can spend your time finding inventory.
        </p>
        <div className="relative mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={onSignUp} className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-white text-accent text-sm font-semibold hover:bg-white/90">
            Get started <ArrowRight className="w-4 h-4" />
          </button>
          <a href={demoHref} className="inline-flex items-center justify-center px-6 py-3 rounded-full border border-white/50 text-sm font-semibold hover:bg-white/10">
            Try the live demo
          </a>
        </div>
      </div>
    </section>
  );
}

// SellSync is Hubby's selling side: shopping across marketplaces, the SellSource storefront and
// live shows. Each card says honestly whether it works today or can be tried in the demo.
const SELLSYNC_CARDS: { icon: ComponentType<{ className?: string }>; title: string; body: string; status: string }[] = [
  {
    icon: ShoppingBag,
    title: "Shop every marketplace",
    body: "One search box for sourcing. Results from SellSource, eBay and Etsy show right in Hubby, and every other marketplace's search is one tap away.",
    status: "Works today",
  },
  {
    icon: Store,
    title: "Your SellSource storefront",
    body: "Publish items from your inventory to your own shop page. Buyers check out without an account, and when an item sells anywhere else it comes down by itself.",
    status: "Try it in the demo",
  },
  {
    icon: Radio,
    title: "Live shows",
    body: "Go live with your storefront items: quick auctions, Buy now, chat, and every win in a show ships together in one package.",
    status: "Try it in the demo",
  },
];

function SellSyncSection() {
  return (
    <section id="sellsync" className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
      <div className="text-center max-w-2xl mx-auto">
        <span className="inline-flex items-center gap-2">
          <SellSyncMark className="w-7 h-7" />
          <SellSyncWordmark className="text-lg" />
        </span>
        <h2 className="font-serif text-3xl sm:text-4xl font-medium mt-4">Selling and buying, built into Hubby</h2>
        <p className="mt-4 text-muted-foreground">
          SellSync is the selling side of Hubby. Everything you sell, all in sync: find stock, open your own storefront and sell live, all from the
          same inventory.
        </p>
      </div>
      <div className="mt-12 grid md:grid-cols-3 gap-5">
        {SELLSYNC_CARDS.map((c) => (
          <div key={c.title} className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <span className="w-11 h-11 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
                <c.icon className="w-5 h-5" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{c.status}</span>
            </div>
            <h3 className="font-display text-xl font-medium mt-5">{c.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{c.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer({ onSignIn }: { onSignIn: () => void }) {
  return (
    <footer className="border-t border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row gap-6 items-center justify-between text-sm text-muted-foreground">
        <Logo />
        <nav className="flex flex-wrap justify-center gap-5">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-foreground">
              {l.label}
            </a>
          ))}
          <button onClick={onSignIn} className="hover:text-foreground">
            Sign in
          </button>
        </nav>
        <p>© {new Date().getFullYear()} Hubby</p>
      </div>
    </footer>
  );
}
