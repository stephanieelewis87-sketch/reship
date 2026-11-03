import type { ComponentType, ReactNode } from "react";
import { ArrowRight, Award, Hammer, LayoutGrid, Package, Recycle, Store } from "lucide-react";
import { Logo } from "../brand/Logo";
import { freeGiftTip, minPriceLabel } from "@/lib/minPrice";

// The public page with SellSync's mission and philosophy (sellsync…/?mission), for anyone,
// signed in or not.
export function MissionPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="max-w-5xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
        <a href="/" aria-label="SellSync home">
          <Logo />
        </a>
        <a href="/" className="text-sm font-medium text-accent hover:underline">
          Back to SellSync
        </a>
      </header>

      <main className="pb-20">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,rgba(181,96,122,0.16),transparent_55%)]" />
          <div className="relative max-w-3xl mx-auto px-4 md:px-8 pt-12 pb-14 text-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-semibold tracking-wide">Our mission</span>
            <h1 className="mt-5 font-serif text-4xl sm:text-5xl font-medium leading-tight">Freedom to run your own business.</h1>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
              SellSync exists so everyday people can build and run a business of their own, on their own terms. We believe deeply in the resale of used goods:
              every pre-owned item that finds a new home is something that didn't have to be made new, and something that stayed out of a landfill.
            </p>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-4 md:px-8 grid sm:grid-cols-2 gap-4">
          <Belief icon={Store} title="Your business, your way">
            Resale lets anyone start with what's in their closet and grow into a real business. Our job is to take the busywork off your plate so your time goes to
            sourcing, selling and growing.
          </Belief>
          <Belief icon={Recycle} title="Resale is good for the planet">
            Buying secondhand keeps quality goods in use for years longer. We're proud to power the people who make that happen every day.
          </Belief>
        </section>

        <section className="max-w-3xl mx-auto px-4 md:px-8 pt-20">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-semibold tracking-wide">Our philosophy</span>
          <h2 className="mt-4 font-serif text-3xl sm:text-4xl font-medium">A seller's labor is not free.</h2>
          <p className="mt-5 text-muted-foreground leading-relaxed">
            Every listing is real work: finding the item, cleaning it, photographing it, measuring it, writing it up, answering questions, packing it and getting
            it to the post office. That work has value. SellSync does not condone free labor, and we won't build tools that ask anyone to give their work away. That's why every item sold through SellSync is
            priced at <strong className="text-foreground">{minPriceLabel} or more</strong>.
          </p>
          <p className="mt-4 text-muted-foreground leading-relaxed">Items listed for less than {minPriceLabel} do more harm than good:</p>
        </section>

        <section className="max-w-5xl mx-auto px-4 md:px-8 pt-8 grid sm:grid-cols-2 gap-4">
          <Belief icon={Hammer} title="They undervalue sellers' work">
            Once fees and supplies are paid, a very low sale leaves nothing for the hours behind it, and it sets a price expectation that makes every seller's
            work worth less.
          </Belief>
          <Belief icon={Package} title="They clog the shipping channels">
            Every package takes packaging, fuel and a carrier's time. Shipping very low-value items one by one adds strain and waste for very little return.
          </Belief>
          <Belief icon={LayoutGrid} title="They clutter the marketplaces">
            When platforms fill up with very low-priced items, quality listings get buried and buyers have a harder time finding what's worth having.
          </Belief>
          <Belief icon={Award} title="They undermine quality brands">
            Well-made, name-brand goods keep their value for years. Rock-bottom pricing trains buyers to expect them for next to nothing.
          </Belief>
        </section>

        <section className="max-w-3xl mx-auto px-4 md:px-8 pt-14">
          <blockquote className="rounded-2xl bg-card border border-border px-6 py-7 sm:px-10">
            <p className="font-serif text-xl sm:text-2xl leading-snug">
              “We honor the quality products of brands like Nike and Under Armour that have been devalued over time due to low prices on resale platforms. That's
              why we strive to keep a sustainable system, as a responsible partner in the resale industry.”
            </p>
            <footer className="mt-4 text-sm text-muted-foreground">The SellSync team</footer>
          </blockquote>
        </section>

        <section className="max-w-3xl mx-auto px-4 md:px-8 pt-14">
          <h2 className="font-serif text-2xl font-medium">What this means in SellSync</h2>
          <ul className="mt-4 space-y-2 text-muted-foreground leading-relaxed list-disc pl-5">
            <li>Every item you list, crosslist or import through SellSync is priced at {minPriceLabel} or more, on every marketplace.</li>
            <li>Price suggestions never start below {minPriceLabel}.</li>
            <li>Have smaller items? Bundle a few similar ones into a single listing. Buyers love a good bundle, and your time is paid for.</li>
            <li>{freeGiftTip}</li>
          </ul>
          <a
            href="/"
            className="mt-8 inline-flex items-center gap-2 px-5 py-3 rounded-full bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent/90 transition-colors"
          >
            Start selling with SellSync <ArrowRight className="w-4 h-4" />
          </a>
        </section>
      </main>
    </div>
  );
}

function Belief({ icon: Icon, title, children }: { icon: ComponentType<{ className?: string }>; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-6">
      <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-accent" />
      </div>
      <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}
