import type { ReactNode } from "react";

// The title row at the top of every section.
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="px-4 md:px-8 py-5 md:py-6 border-b border-border flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <h1 className="font-serif text-2xl md:text-[28px] font-medium tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
