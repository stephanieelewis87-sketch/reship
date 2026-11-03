// SellSync's brand marks: the rose gold S emblem and the two-weight wordmark from the logo.

export const TAGLINE = "Everything you sell. All in sync.";

export function BrandMark({ className = "w-8 h-8" }: { className?: string }) {
  return <img src="/sellsync-mark.png" alt="" className={`${className} rounded-lg bg-black object-cover shrink-0`} />;
}

export function Wordmark({ className = "text-sm" }: { className?: string }) {
  return (
    <span className={`font-display uppercase tracking-[0.12em] text-metal ${className}`}>
      <span className="font-extrabold">Sell</span>
      <span className="font-light">Sync</span>
    </span>
  );
}

export function Logo({ size = "sm", tagline = false }: { size?: "sm" | "lg"; tagline?: boolean }) {
  const lg = size === "lg";
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark className={lg ? "w-10 h-10" : "w-8 h-8"} />
      <span className="flex flex-col">
        <Wordmark className={lg ? "text-xl leading-none" : "text-[16px] leading-none"} />
        {tagline && <span className="mt-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{TAGLINE}</span>}
      </span>
    </span>
  );
}
