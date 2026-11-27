import { useEffect, useState } from "react";

// Light (the default) or dark look, remembered on this device. index.html applies the saved choice before the
// first paint so the page never flashes the other look.
export type ThemeMode = "light" | "dark";
const KEY = "sellsync-theme";

export function savedTheme(): ThemeMode {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle("dark", mode === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", mode === "dark" ? "#1C1716" : "#FBF6F3");
}

export function setThemeMode(mode: ThemeMode) {
  applyTheme(mode);
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* private window: the choice lasts for this visit only */
  }
  window.dispatchEvent(new CustomEvent(KEY, { detail: mode }));
}

// Every switch on the page shows the same choice.
export function useThemeMode(): [ThemeMode, (m: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(savedTheme);
  useEffect(() => {
    const on = (e: Event) => setMode((e as CustomEvent<ThemeMode>).detail);
    window.addEventListener(KEY, on);
    return () => window.removeEventListener(KEY, on);
  }, []);
  return [mode, setThemeMode];
}
