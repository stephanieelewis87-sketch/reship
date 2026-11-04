import { useEffect, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Check,
  ChevronDown,
  Landmark,
  Menu,
  Printer,
  Radio,
  Store,
  RefreshCw,
  Repeat2,
  Shirt,
  Sparkles,
  Gift,
  Undo2,
  Video,
  X,
} from "lucide-react";
import { ALL_PLATFORMS, type Platform } from "@/lib/types";
import { MARKETPLACES as MARKETPLACE_INFO } from "@/lib/marketplaces";
import { PlatformIcon } from "../ui";
import { Logo as BrandLogo } from "../brand/Logo";
import { PLANS as PLAN_INFO, PLAN_IDS, priceLabel } from "@/lib/plans";
import { MISSION_HREF, freeGiftTip, minPriceLabel } from "@/lib/minPrice";

// Every marketplace SellSync works with, from the marketplace address book.
const MARKETPLACES = ALL_PLATFORMS;

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
        <FeatureVideo />
        <FeaturePayouts />
        <FeatureLabels />
        <MoreTools />
        <ComingNext onSignUp={onSignUp} />
        <HowItWorks />
        <Pricing onSignUp={onSignUp} />
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
    <a href="#top" className="flex items-center gap-2.5" aria-label="SellSync">
      <BrandLogo />
    </a>
  );
}

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#coming", label: "Coming in 2027" },
  { href: "#pricing", label: "Pricing" },
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
            <Sparkles className="w-3.5 h-3.5" /> The all-in-one reseller app
          </Eyebrow>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-medium leading-[1.05] mt-5 tracking-tight">
            List with a video.
            <br />
            Cash out in one tap.
            <br />
            <span className="text-accent">Ship in one print.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-md">
            SellSync turns a quick clip of your item into a ready-to-post listing, pulls your payouts from every marketplace together, and prints
            every label you owe in a single batch.
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
      <div className="absolute left-0 top-4 w-[58%] rotate-[-4deg]">
        <PhoneFrame>
          <VideoScreen step={4} compact />
        </PhoneFrame>
      </div>
      <div className="absolute right-0 top-0 w-[56%] bg-card border border-border rounded-2xl shadow-xl p-4 rotate-[3deg]">
        <p className="text-[12px] uppercase tracking-wider text-muted-foreground">Ready to withdraw</p>
        <p className="font-display text-3xl mt-1">$481.45</p>
        <div className="mt-3 h-9 rounded-full bg-accent text-accent-foreground text-xs font-semibold flex items-center justify-center gap-1.5">
          <Landmark className="w-3.5 h-3.5" /> Withdraw all
        </div>
        <div className="mt-3 flex -space-x-1">
          {MARKETPLACES.slice(0, 4).map((p) => (
            <span key={p} className="w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center">
              <PlatformIcon platform={p} className="w-3.5 h-3.5" />
            </span>
          ))}
        </div>
      </div>
      <div className="absolute right-4 bottom-0 w-[44%] rotate-[-2deg]">
        <LabelCard sku="DN-0412" carrier="USPS Ground Advantage" className="shadow-xl" />
        <div className="absolute -top-3 -left-3 px-2.5 py-1 rounded-full bg-foreground text-background text-[12px] font-semibold flex items-center gap-1">
          <Printer className="w-3 h-3" /> 12 labels, 1 click
        </div>
      </div>
    </div>
  );
}

function MarketplaceStrip() {
  return (
    <section className="border-y border-border bg-card/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col md:flex-row items-center gap-4 md:gap-8">
        <p className="text-xs uppercase tracking-wider text-muted-foreground shrink-0">Works with your marketplaces</p>
        <div className="flex flex-wrap justify-center md:justify-start gap-x-6 gap-y-3">
          {MARKETPLACES.map((p) => (
            <span key={p} className="flex items-center gap-2 text-sm font-medium text-foreground/80">
              <PlatformIcon platform={p} className="w-4 h-4" />
              {MARKETPLACE_INFO[p].name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

const PILLARS: { icon: ComponentType<{ className?: string }>; title: string; body: string; href: string }[] = [
  {
    icon: Video,
    title: "Video listing",
    body: "Film your item for a few seconds. SellSync writes the title, brand, size, condition and price, and picks the best photos.",
    href: "#video",
  },
  {
    icon: Landmark,
    title: "One-button payouts",
    body: "See what every marketplace owes you in one balance, and withdraw all of it with a single tap.",
    href: "#payouts",
  },
  {
    icon: Printer,
    title: "Easy shipping labels",
    body: "Every sold order's label in one PDF, stamped with your SKU and followed by a packing slip. 4x6, Letter or A4.",
    href: "#labels",
  },
];

function FeaturePillars() {
  return (
    <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
      <div className="text-center max-w-2xl mx-auto">
        <Eyebrow>Why resellers switch</Eyebrow>
        <h2 className="font-serif text-3xl sm:text-4xl font-medium mt-4">The three slowest parts of reselling, made fast</h2>
        <p className="mt-4 text-muted-foreground">Less typing, fewer tabs, and no more printing labels one at a time.</p>
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

// Steps through a demo loop every `ms`, unless the visitor prefers reduced motion (then it shows the last step).
function useLoopStep(count: number, ms: number) {
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [step, setStep] = useState(reduce ? count - 1 : 0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setStep((s) => (s + 1) % count), ms);
    return () => clearInterval(t);
  }, [count, ms, reduce]);
  return step;
}

function FeatureVideo() {
  const step = useLoopStep(6, 1100);
  return (
    <FeatureRow
      id="video"
      eyebrow="Video listing"
      title="Film it once. The listing writes itself."
      body="Hold your phone up, turn the item around, and say anything worth knowing. SellSync turns the clip into a complete listing you can post everywhere."
      points={[
        "Title, brand, size, color and condition filled in from the video",
        "Sharp photos pulled straight from the clip, no photo shoot",
        "Price suggestion based on what similar items sold for",
        "Crosslist to every marketplace from the same draft",
      ]}
      visual={
        <div className="flex items-center justify-center gap-4 sm:gap-6">
          <div className="w-44 sm:w-52 shrink-0">
            <PhoneFrame>
              <VideoScreen step={step} />
            </PhoneFrame>
          </div>
          <ListingDraft step={step} />
        </div>
      }
    />
  );
}

function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[2rem] bg-foreground p-2 shadow-2xl">
      <div className="rounded-[1.6rem] overflow-hidden bg-[#2a1d24] aspect-[9/17] relative">{children}</div>
    </div>
  );
}

function VideoScreen({ step, compact = false }: { step: number; compact?: boolean }) {
  const progress = Math.min(100, (step / 4) * 100);
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex items-center justify-between px-3 pt-3 text-[11px] text-white/80">
        <span className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full bg-red-500 ${step < 4 ? "animate-pulse" : ""}`} />
          {step < 4 ? "REC" : "Done"}
        </span>
        <span className="font-mono">0:0{Math.min(step * 2, 8)}</span>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="relative">
          <div className="absolute inset-0 blur-2xl bg-accent/40 rounded-full" />
          <Shirt
            className={`relative text-[#F3D9E1] transition-transform duration-700 ${compact ? "w-20 h-20" : "w-24 h-24"}`}
            style={{ transform: `rotateY(${step * 45}deg)` }}
            strokeWidth={1.2}
          />
        </div>
      </div>
      <div className="px-3 pb-3 space-y-2">
        <div className="h-1 rounded-full bg-white/15 overflow-hidden">
          <div className="h-full bg-accent transition-all duration-700" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-center">
          <span className="w-9 h-9 rounded-full border-2 border-white flex items-center justify-center">
            <span className={`bg-red-500 transition-all ${step < 4 ? "w-6 h-6 rounded-full" : "w-3.5 h-3.5 rounded-sm"}`} />
          </span>
        </div>
      </div>
    </div>
  );
}

const DRAFT_FIELDS = [
  { label: "Title", value: "Vintage Levi's 501 denim jacket" },
  { label: "Brand", value: "Levi's" },
  { label: "Size", value: "M" },
  { label: "Condition", value: "Excellent, light fading" },
  { label: "Price", value: "$58" },
];

function ListingDraft({ step }: { step: number }) {
  return (
    <div className="flex-1 max-w-[15rem] bg-card border border-border rounded-2xl shadow-xl p-4">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-accent">
        <Sparkles className="w-3.5 h-3.5" /> Drafted from your video
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`aspect-square rounded-lg bg-gradient-to-br from-[#E9D3DA] to-[#C9A0AE] flex items-center justify-center transition-opacity duration-500 ${
              step > i ? "opacity-100" : "opacity-20"
            }`}
          >
            <Shirt className="w-5 h-5 text-white/90" strokeWidth={1.5} />
          </div>
        ))}
      </div>
      <dl className="mt-3 space-y-2">
        {DRAFT_FIELDS.map((f, i) => (
          <div key={f.label}>
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{f.label}</dt>
            <dd className="text-xs font-medium h-4">
              {step > i ? f.value : <span className="block h-2.5 mt-1 w-3/4 rounded bg-muted animate-pulse" />}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const BALANCES: { platform: Platform; amount: number }[] = [
  { platform: "Poshmark", amount: 214.5 },
  { platform: "eBay", amount: 132.75 },
  { platform: "Mercari", amount: 88.2 },
  { platform: "Depop", amount: 46.0 },
];
const money = (n: number) => `$${n.toFixed(2)}`;

function FeaturePayouts() {
  return (
    <FeatureRow
      id="payouts"
      eyebrow="One-button payouts"
      title="Every marketplace balance. One withdraw button."
      body="Stop logging in to four apps to move your money. SellSync adds up what each marketplace is holding for you and sends it all to your bank in one go."
      points={[
        "One running balance across all your marketplaces",
        "Withdraw everything, or pick which marketplaces to cash out",
        "Each payout is matched to the sales it came from",
        "Payouts flow into your profit and tax reports automatically",
      ]}
      flip
      tint
      visual={<PayoutDemo />}
    />
  );
}

function PayoutDemo() {
  const [state, setState] = useState<"ready" | "sending" | "sent">("ready");
  const total = BALANCES.reduce((s, b) => s + b.amount, 0);
  useEffect(() => {
    if (state !== "sending") return;
    const t = setTimeout(() => setState("sent"), 1400);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <div className="max-w-sm mx-auto bg-card border border-border rounded-2xl shadow-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Available to withdraw</p>
          <p className="font-display text-4xl mt-1">{state === "sent" ? "$0.00" : money(total)}</p>
        </div>
        <span className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
          <Landmark className="w-5 h-5" />
        </span>
      </div>
      <ul className="mt-5 divide-y divide-border">
        {BALANCES.map((b, i) => (
          <li key={b.platform} className="py-2.5 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2.5">
              <PlatformIcon platform={b.platform} className="w-4 h-4" />
              {b.platform}
            </span>
            <span className="font-mono text-sm flex items-center gap-2">
              {state === "ready" && money(b.amount)}
              {state === "sending" && (
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDelay: `${i * 80}ms` }} />
                  {money(b.amount)}
                </span>
              )}
              {state === "sent" && (
                <span className="text-emerald-600 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Sent
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {state === "sent" ? (
        <div className="mt-4 rounded-xl bg-emerald-50 text-emerald-800 text-sm p-3 flex items-center justify-between">
          <span>{money(total)} is on its way to your bank</span>
          <button onClick={() => setState("ready")} className="text-xs font-semibold underline">
            Replay
          </button>
        </div>
      ) : (
        <button
          onClick={() => setState("sending")}
          disabled={state === "sending"}
          className={`${ctaPrimary} w-full mt-4 disabled:opacity-70`}
        >
          {state === "sending" ? "Sending…" : `Withdraw ${money(total)}`}
        </button>
      )}
      <p className="mt-2 text-center text-[12px] text-muted-foreground">Try it: this is a demo, no money moves.</p>
    </div>
  );
}

function FeatureLabels() {
  const [printed, setPrinted] = useState(false);
  return (
    <FeatureRow
      id="labels"
      eyebrow="Easy shipping labels"
      title="Every label you owe, printed in one click."
      body="SellSync collects the labels your marketplaces already generated for each sale, so there is nothing to buy or retype. Select your orders and print them all at once."
      points={[
        "One PDF for every marketplace's labels, sized for 4x6, Letter or A4",
        "Your SKU stamped on each label so you grab the right item",
        "A packing slip printed after each label, bundles included",
        "Need a different carrier? Compare USPS, UPS and FedEx rates",
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

const MORE: { icon: ComponentType<{ className?: string }>; title: string; body: string }[] = [
  { icon: Repeat2, title: "Crosslisting", body: "Post one draft to Poshmark, Mercari, eBay, Depop and more." },
  { icon: Boxes, title: "Inventory", body: "Know what's listed where, what sold, and what's sitting too long." },
  { icon: BarChart3, title: "Profit analytics", body: "Real profit after fees, shipping and what you paid for each item." },
  { icon: Undo2, title: "Returns", body: "Track returns and put items back into inventory in a tap." },
];

function MoreTools() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="font-serif text-3xl sm:text-4xl font-medium">Plus everything else your shop runs on</h2>
        <p className="mt-4 text-muted-foreground">One app from the first photo to the money in your bank.</p>
      </div>
      <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {MORE.map((m) => (
          <div key={m.title} className="bg-card border border-border rounded-2xl p-5">
            <m.icon className="w-5 h-5 text-accent" />
            <h3 className="font-semibold mt-3">{m.title}</h3>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{m.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// What SellSync is building for 2027. Plans, not promises: dates and details can change.
const COMING: { icon: ComponentType<{ className?: string }>; title: string; body: string; tag?: string }[] = [
  {
    icon: Radio,
    title: "Live selling",
    body: "Go live from SellSync and sell to your followers on video. Items sell straight from your inventory, so a live sale is delisted everywhere else at once.",
  },
  {
    icon: Store,
    title: "SellSource marketplace",
    body: "Our own marketplace, where buyers shop sellers' items directly. Your SellSync inventory is already your storefront, with no extra listing work.",
    tag: "3% seller fee",
  },
];

function ComingNext({ onSignUp }: { onSignUp: () => void }) {
  return (
    <section id="coming" className="scroll-mt-16 max-w-6xl mx-auto px-4 sm:px-6 pb-20">
      <div className="rounded-3xl border border-border bg-secondary/60 px-5 sm:px-10 py-12">
        <div className="text-center max-w-2xl mx-auto">
          <Eyebrow>Coming in 2027</Eyebrow>
          <h2 className="font-serif text-3xl sm:text-4xl font-medium mt-4">Sell live, and sell on SellSource</h2>
          <p className="mt-4 text-muted-foreground">Two big things on the way next year. Sign up now and you'll be first in line.</p>
        </div>
        <div className="mt-10 grid md:grid-cols-2 gap-4">
          {COMING.map((c) => (
            <div key={c.title} className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center gap-2">
                <c.icon className="w-5 h-5 text-accent" />
                <h3 className="font-semibold">{c.title}</h3>
                {c.tag && <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent">{c.tag}</span>}
              </div>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{c.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <button type="button" onClick={onSignUp} className={ctaPrimary}>
            Get early access <ArrowRight className="w-4 h-4" />
          </button>
          <p className="mt-3 text-xs text-muted-foreground">Plans for 2027. Features, timing and fees may change before launch.</p>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { title: "Connect your marketplaces", body: "Add the SellSync browser extension and stay logged in where you already sell. We never ask for your passwords." },
  { title: "List and sell", body: "Film new items to create listings, and watch sold orders arrive in one dashboard." },
  { title: "Ship and get paid", body: "Print the day's labels in one batch, then withdraw every balance with one tap." },
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

// The plans come from src/lib/plans.ts, the same list the app and the affiliate program use.
const PLANS = PLAN_IDS.map((id, i) => ({
  id,
  name: PLAN_INFO[id].name,
  price: priceLabel(id),
  pitch: PLAN_INFO[id].pitch,
  features: [...(i > 0 ? [`Everything in ${PLAN_INFO[PLAN_IDS[i - 1]].name}`] : []), ...PLAN_INFO[id].adds],
  featured: id === "flow",
}));

function Pricing({ onSignUp }: { onSignUp: () => void }) {
  return (
    <section id="pricing" className="scroll-mt-16 max-w-6xl mx-auto px-4 sm:px-6 py-20">
      <div className="text-center max-w-2xl mx-auto">
        <Eyebrow>Pricing</Eyebrow>
        <h2 className="font-serif text-3xl sm:text-4xl font-medium mt-4">Start selling. Grow into everything.</h2>
        <p className="mt-4 text-muted-foreground">Pick the plan that fits your shop today, and change it any time.</p>
      </div>
      <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-5 gap-4 items-stretch">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`relative flex flex-col rounded-3xl p-6 ${
              plan.featured ? "bg-foreground text-background shadow-2xl lg:-my-3" : "bg-card border border-border"
            }`}
          >
            {plan.featured && (
              <span className="absolute -top-3 left-6 px-3 py-1 rounded-full bg-accent text-accent-foreground text-xs font-semibold">Everything included</span>
            )}
            <p className="font-semibold text-lg">{plan.name}</p>
            <p className={`mt-1 text-sm ${plan.featured ? "text-background/70" : "text-muted-foreground"}`}>{plan.pitch}</p>
            <p className="mt-5">
              <span className="font-display text-4xl">{plan.price}</span>
              <span className={plan.featured ? "text-background/70" : "text-muted-foreground"}> / month</span>
            </p>
            <ul className="mt-6 space-y-3 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-3 text-sm">
                  <Check className={`w-4 h-4 shrink-0 mt-0.5 ${plan.featured ? "text-accent" : "text-accent"}`} />
                  {f}
                </li>
              ))}
            </ul>
            <button onClick={onSignUp} className={`${plan.featured ? ctaPrimary : ctaSecondary} w-full mt-8`}>
              Choose {plan.name} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">Cancel any time.</p>
      <p className="mt-2 text-center text-sm text-foreground">
        <span className="font-semibold">Just want to meet other sellers?</span> The Community is free on every plan, and with a free account. No card needed.
      </p>
      <div className="mt-8 max-w-2xl mx-auto flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/5 px-5 py-4 text-sm">
        <Gift className="w-5 h-5 text-accent shrink-0 mt-0.5" />
        <p>
          <span className="font-semibold">Every item lists at {minPriceLabel} or more.</span> {freeGiftTip}{" "}
          <a href={MISSION_HREF} className="text-accent font-medium hover:underline">
            Why we have a minimum
          </a>
        </p>
      </div>
    </section>
  );
}

const FAQS = [
  {
    q: "Do I have to give SellSync my marketplace passwords?",
    a: "No. The SellSync browser extension works through the marketplace accounts you're already logged in to in Chrome, so your passwords stay with you.",
  },
  {
    q: "Which marketplaces work?",
    a: "SellSync works with Poshmark, Mercari, eBay, Etsy, Depop, Vinted, Whatnot, Facebook Marketplace, ThredUp, OfferUp, Curtsy, Grailed, Vestiaire Collective and your own Shopify store. Poshmark, Mercari and Vinted orders sync through the browser extension; the others come in by CSV export or by hand, and you can import the listings you already have from any of them.",
  },
  {
    q: "Is the Community free?",
    a: "Yes. The Community, where sellers share tips, ask questions and help each other, is open on every plan and to free accounts. You only pay for the selling tools.",
  },
  {
    q: "Do I have to buy labels through SellSync?",
    a: "No. SellSync prints the prepaid labels your marketplaces already made for each sale. If you want a different carrier, you can compare rates for USPS, UPS and FedEx.",
  },
  {
    q: "What label sizes can I print?",
    a: "4x6 thermal labels, US Letter and A4. SellSync crops and rotates marketplace labels to fit, and can add a packing slip after each one.",
  },
  {
    q: `Why is there a ${minPriceLabel} minimum price?`,
    a: `A seller's labor is not free. Very low-priced items leave nothing for the work behind them, clog the shipping channels and the marketplaces, and undervalue quality brands. Every item listed through SellSync is priced at ${minPriceLabel} or more. Smaller items sell well bundled together, or as a free gift with another item, using the FREE GIFT WITH ORDER cover banner. Read more on our Mission page.`,
  },
  {
    q: "Does it work on my phone?",
    a: "Yes. SellSync works in your phone's browser, which is also the easiest way to film items for video listings.",
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
        <h2 className="relative font-display text-3xl sm:text-4xl font-medium">Spend your time finding inventory, not doing paperwork.</h2>
        <p className="relative mt-4 text-white/85 max-w-xl mx-auto">List faster, ship in one batch, and cash out in one tap.</p>
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
        <p>© {new Date().getFullYear()} SellSync</p>
      </div>
    </footer>
  );
}
