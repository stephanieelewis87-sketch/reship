// Runs inside a marketplace tab when the seller clicks "Capture this page". It records how the
// page is built (its HTML, embedded data and the addresses it loaded data from) so a connector
// can be written for it. Cookies, storage and form values are never read.
export async function capturePage() {
  const html = document.documentElement.cloneNode(true) as HTMLElement;
  html.querySelectorAll("input, textarea").forEach((el) => el.setAttribute("value", ""));
  html.querySelectorAll("img").forEach((img) => img.removeAttribute("srcset"));
  const scripts = [...document.querySelectorAll("script")]
    .filter((s) => s.type === "application/json" || s.type === "application/ld+json" || s.id === "__NEXT_DATA__" || /window\.__/.test(s.textContent ?? ""))
    .map((s) => ({ id: s.id, type: s.type, text: (s.textContent ?? "").slice(0, 500_000) }));
  html.querySelectorAll("script, style, svg, noscript").forEach((el) => el.remove());
  const entries = performance.getEntriesByType("resource").map((e) => e as PerformanceResourceTiming);
  const site = location.hostname.replace(/^www\./, "");
  const requests = entries
    .filter((e) => e.initiatorType === "fetch" || e.initiatorType === "xmlhttprequest" || new URL(e.name).hostname.endsWith(site))
    .map((e) => `${e.initiatorType} ${e.name}`);
  const links = [...document.querySelectorAll("a[href]")]
    .map((a) => (a as HTMLAnchorElement).href)
    .filter((h) => /label|order|sold|ship/i.test(h));

  // Re-reads the site's own data addresses this page already loaded and keeps only the shape of
  // each answer: field names and value types, never the values (no buyer names or addresses).
  const shape = (value: unknown, depth = 0): unknown => {
    if (depth > 8) return "…";
    if (Array.isArray(value)) return value.length ? [shape(value[0], depth + 1), `${value.length} items`] : [];
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v, depth + 1)]));
    }
    if (typeof value === "string") {
      if (/^https?:\/\//.test(value)) return `url:${new URL(value).hostname}${new URL(value).pathname.replace(/[0-9a-f]{16,}/gi, ":id")}`;
      return /^\d{4}-\d\d-\d\d/.test(value) ? "date" : "string";
    }
    return typeof value;
  };
  const dataUrls = [...new Set(entries.map((e) => e.name))].filter((u) => {
    const url = new URL(u);
    return url.origin === location.origin && /\/(vm-rest|api|v1|v2)\//.test(url.pathname) && !/trck|metrics|events|analytics/.test(url.pathname);
  });
  const responses: { url: string; status: number; contentType: string; shape: unknown }[] = [];
  for (const url of dataUrls.slice(0, 20)) {
    try {
      const res = await fetch(url, { credentials: "include" });
      const contentType = res.headers.get("content-type") ?? "";
      responses.push({ url, status: res.status, contentType, shape: /json/.test(contentType) ? shape(await res.json()) : null });
    } catch (e) {
      responses.push({ url, status: 0, contentType: "", shape: String(e) });
    }
  }

  return {
    capturedAt: new Date().toISOString(),
    version: 2,
    url: location.href,
    title: document.title,
    requests: [...new Set(requests)],
    responses,
    links: [...new Set(links)],
    dataScripts: scripts,
    html: html.outerHTML.slice(0, 2_000_000),
  };
}
