import { useEffect, useState } from "react";

// Sections of the app, kept in the address (#/inventory) so a refresh or a shared link lands in the same place.
export type Section = "home" | "inventory" | "automations" | "orders" | "analytics" | "settings" | "feedback";
export const SECTIONS: Section[] = ["home", "inventory", "automations", "orders", "analytics", "settings", "feedback"];

export interface Route {
  section: Section;
  params: URLSearchParams;
}

function parse(): Route {
  const [path, query] = window.location.hash.replace(/^#\/?/, "").split("?");
  const section = (SECTIONS as string[]).includes(path) ? (path as Section) : "home";
  return { section, params: new URLSearchParams(query ?? "") };
}

export function go(section: Section, params?: Record<string, string>) {
  const q = params ? `?${new URLSearchParams(params)}` : "";
  window.location.hash = `/${section}${q}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
