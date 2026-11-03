import { Moon, Sun } from "lucide-react";
import { useThemeMode } from "@/lib/themeMode";

// A two-way switch between the light and dark looks.
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [mode, setMode] = useThemeMode();
  const options = [
    { key: "light", label: "Light", icon: Sun },
    { key: "dark", label: "Dark", icon: Moon },
  ] as const;
  return (
    <div role="radiogroup" aria-label="Look" className={`flex p-0.5 rounded-lg bg-muted ${className}`}>
      {options.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={mode === key}
          onClick={() => setMode(key)}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors ${
            mode === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon className="w-3.5 h-3.5" /> {label}
        </button>
      ))}
    </div>
  );
}
