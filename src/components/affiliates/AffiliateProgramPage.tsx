import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Logo } from "../brand/Logo";
import { DEFAULT_PROGRAM, type AffiliateProgram } from "@/lib/affiliates";
import { supabase } from "@/lib/supabase";
import { loadProgram } from "@/lib/affiliateStore";
import { EarningsCalculator, HowItWorks, ProgramHero, ProgramTerms } from "./ProgramPitch";

// The public page about the affiliate program (reship…/?affiliates), for anyone, signed in or not.
export function AffiliateProgramPage() {
  const [program, setProgram] = useState<AffiliateProgram>(DEFAULT_PROGRAM);
  useEffect(() => {
    loadProgram().then(setProgram);
  }, []);
  // Signing up (or opening the demo) lands on the Affiliates tab, where joining takes one step.
  const join = `${window.location.origin}/${supabase ? "" : "?demo"}#/affiliates`;
  return (
    <div className="min-h-screen bg-background">
      <header className="max-w-5xl mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
        <a href="/" aria-label="SellSync home">
          <Logo />
        </a>
        <a href={join} className="text-sm font-medium text-accent hover:underline">
          Sign in
        </a>
      </header>
      <main className="max-w-5xl mx-auto px-4 md:px-8 pb-16 space-y-4">
        <ProgramHero program={program}>
          <a href={join} className="px-4 py-2 rounded-md bg-accent text-accent-foreground text-sm font-medium hover:bg-accent-hover inline-flex items-center gap-2">
            Join the program, free <ArrowRight className="w-4 h-4" />
          </a>
        </ProgramHero>
        <HowItWorks program={program} />
        <EarningsCalculator program={program} />
        <ProgramTerms program={program} />
      </main>
    </div>
  );
}
