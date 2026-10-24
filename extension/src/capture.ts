// Runs inside a marketplace tab when the seller clicks "Capture this page". It records how the
// page is built (its HTML, embedded data and the addresses it loaded data from) so a connector
// can be written for it. Cookies, storage and form values are never read.
export function capturePage() {
  const html = document.documentElement.cloneNode(true) as HTMLElement;
  html.querySelectorAll("input, textarea").forEach((el) => el.setAttribute("value", ""));
  html.querySelectorAll("img").forEach((img) => img.removeAttribute("srcset"));
  const scripts = [...document.querySelectorAll("script")]
    .filter((s) => s.type === "application/json" || s.type === "application/ld+json" || s.id === "__NEXT_DATA__" || /window\\.__/.test(s.textContent ?? ""))
    .map((s) => ({ id: s.id, type: s.type, text: (s.textContent ?? "").slice(0, 500_000) }));
  html.querySelectorAll("script, style, svg, noscript").forEach((el) => el.remove());
  const requests = performance
    .getEntriesByType("resource")
    .map((e) => e as PerformanceResourceTiming)
    .filter((e) => e.initiatorType === "fetch" || e.initiatorType === "xmlhttprequest")
    .map((e) => e.name);
  const links = [...document.querySelectorAll("a[href]")]
    .map((a) => (a as HTMLAnchorElement).href)
    .filter((h) => /label|order|sold|ship/i.test(h));
  return {
    capturedAt: new Date().toISOString(),
    url: location.href,
    title: document.title,
    requests: [...new Set(requests)],
    links: [...new Set(links)],
    dataScripts: scripts,
    html: html.outerHTML.slice(0, 2_000_000),
  };
}
