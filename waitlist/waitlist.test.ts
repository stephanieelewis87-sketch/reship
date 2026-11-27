import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidEmail, joinWaitlist, normalizeEmail, saveAnswers, sourceFromUrl } from "./waitlist";

const config = { url: "https://example.supabase.co/", anonKey: "anon" };

afterEach(() => vi.unstubAllGlobals());

describe("emails", () => {
  it("accepts ordinary addresses and trims them", () => {
    expect(isValidEmail("  Jane.Doe+shop@Example.com ")).toBe(true);
    expect(normalizeEmail("  Jane@Example.COM ")).toBe("jane@example.com");
  });
  it("rejects things that aren't emails", () => {
    for (const bad of ["", "jane", "jane@", "jane@example", "ja ne@example.com", "@example.com"]) {
      expect(isValidEmail(bad)).toBe(false);
    }
  });
});

describe("sourceFromUrl", () => {
  it("reads ref, then utm_source", () => {
    expect(sourceFromUrl("https://hubby.app/?ref=tiktok")).toBe("tiktok");
    expect(sourceFromUrl("https://hubby.app/?utm_source=ig")).toBe("ig");
    expect(sourceFromUrl("https://hubby.app/")).toBeNull();
  });
});

describe("joinWaitlist", () => {
  it("calls the join_waitlist function with the publishable key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await joinWaitlist(config, " Jane@Example.com", "tiktok", null);
    expect(result).toEqual({ ok: true, demo: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.supabase.co/rest/v1/rpc/join_waitlist");
    expect(init.headers.apikey).toBe("anon");
    expect(JSON.parse(init.body)).toEqual({ p_email: "jane@example.com", p_source: "tiktok", p_referrer: null });
  });

  it("never calls the server for a bad email", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await joinWaitlist(config, "nope", null, null)).toEqual({ ok: false, reason: "invalid_email" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports server and network problems", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"message":"invalid_email"}', { status: 400 })));
    expect(await joinWaitlist(config, "a@b.co", null, null)).toEqual({ ok: false, reason: "invalid_email" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));
    expect(await joinWaitlist(config, "a@b.co", null, null)).toEqual({ ok: false, reason: "server" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await joinWaitlist(config, "a@b.co", null, null)).toEqual({ ok: false, reason: "network" });
  });

  it("works without Supabase settings (local preview)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await joinWaitlist({}, "a@b.co", null, null)).toEqual({ ok: true, demo: true });
    expect(await saveAnswers({}, "a@b.co", ["poshmark"], "starting")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
