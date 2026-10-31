import type { ReactNode } from "react";

// The title row at the top of every section.
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="px-4 md:px-8 py-4 md:py-5 border-b border-border flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <h1 className="font-display text-lg font-semibold text-foreground">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
