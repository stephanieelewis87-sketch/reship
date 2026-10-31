import type { LabelDef } from "@/lib/types";

// Pick inventory labels (set up in Settings) by tapping them.
export function LabelChips({ defs, value, onChange }: { defs: LabelDef[]; value: string[]; onChange: (ids: string[]) => void }) {
  if (!defs.length) return <p className="text-[11px] text-muted-foreground">Create labels in Settings to tag items, like "Bin A" or "Needs photos".</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {defs.map((l) => {
        const on = value.includes(l.id);
        return (
          <button
            key={l.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== l.id) : [...value, l.id])}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs ${on ? "border-foreground/30 bg-muted text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
            {l.name}
          </button>
        );
      })}
    </div>
  );
}

export function LabelDots({ defs, ids }: { defs: LabelDef[]; ids?: string[] }) {
  const shown = defs.filter((d) => ids?.includes(d.id));
  if (!shown.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {shown.map((l) => (
        <span key={l.id} className="inline-flex items-center gap-1 px-1.5 rounded-full bg-muted text-[10px] text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: l.color }} />
          {l.name}
        </span>
      ))}
    </span>
  );
}
