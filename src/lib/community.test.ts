// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import {
  type CommunityPost,
  type Meetup,
  applyReaction,
  applyRsvp,
  authorNameFrom,
  excerpt,
  filterPosts,
  hotScore,
  isFull,
  mapsUrl,
  meetupIcs,
  meetupProblem,
  meetupState,
  postProblem,
  replyProblem,
  sortPosts,
  splitMeetups,
  topReactions,
  visibleReplies,
} from "./community";
import { LocalCommunity, sampleCommunity } from "./communityStore";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3600000).toISOString();
const post = (over: Partial<CommunityPost>): CommunityPost => ({
  id: "p",
  userId: "u",
  authorName: "A",
  category: "tips",
  title: "Title",
  body: "Body",
  likeCount: 0,
  replyCount: 0,
  createdAt: hoursAgo(1),
  lastActivityAt: hoursAgo(1),
  likedByMe: false,
  mine: false,
  reactions: {},
  ...over,
});

describe("community rules", () => {
  it("checks posts and replies before sending", () => {
    // Headlines are optional, like a group feed.
    expect(postProblem({ category: "tips", title: "", body: "Just the words" })).toBeNull();
    expect(postProblem({ category: "tips", title: "x".repeat(141), body: "x" })).toMatch(/headline/);
    expect(postProblem({ category: "tips", title: "Good title", body: "  " })).toMatch(/Write/);
    expect(postProblem({ category: "tips", title: "Good title", body: "ok" })).toBeNull();
    expect(replyProblem(" ")).toMatch(/reply/);
    expect(replyProblem("x".repeat(5001))).toMatch(/5,000/);
  });

  it("never falls back to an email for the author name", () => {
    expect(authorNameFrom("  Maya's Closet ")).toBe("Maya's Closet");
    expect(authorNameFrom("")).toBe("Hubby seller");
    expect(authorNameFrom("x".repeat(80))).toHaveLength(60);
  });

  it("hides blocked sellers and removed posts, except your own or for admins", () => {
    const posts = [post({ id: "a", userId: "bad" }), post({ id: "b", removedAt: hoursAgo(1) }), post({ id: "c", userId: "bad", mine: true }), post({ id: "d", category: "wins" })];
    const blocked = new Set(["bad"]);
    expect(filterPosts(posts, { blocked }).map((p) => p.id)).toEqual(["c", "d"]);
    expect(filterPosts(posts, { blocked, showRemoved: true }).map((p) => p.id)).toEqual(["b", "c", "d"]);
    expect(filterPosts(posts, { category: "wins" }).map((p) => p.id)).toEqual(["d"]);
    expect(filterPosts(posts, { category: "mine" }).map((p) => p.id)).toEqual(["c"]);
    expect(filterPosts([post({ id: "e", body: "Poly mailers rule" })], { search: "MAILERS" })).toHaveLength(1);
  });

  it("sorts by activity, by date, and by a score that fades with age", () => {
    const old = post({ id: "old", likeCount: 50, createdAt: hoursAgo(24 * 30), lastActivityAt: hoursAgo(1) });
    const fresh = post({ id: "fresh", likeCount: 5, createdAt: hoursAgo(2), lastActivityAt: hoursAgo(2) });
    expect(sortPosts([fresh, old], "active", NOW)[0].id).toBe("old");
    expect(sortPosts([old, fresh], "new", NOW)[0].id).toBe("fresh");
    expect(sortPosts([old, fresh], "top", NOW)[0].id).toBe("fresh");
    expect(hotScore({ likeCount: 10, replyCount: 0, createdAt: hoursAgo(1) }, NOW)).toBeGreaterThan(hotScore({ likeCount: 1, replyCount: 0, createdAt: hoursAgo(1) }, NOW));
  });

  it("keeps replies in order and hides blocked or removed ones", () => {
    const base = { postId: "p", authorName: "A", likeCount: 0, likedByMe: false, mine: false };
    const replies = [
      { ...base, id: "2", userId: "x", body: "", createdAt: hoursAgo(1) },
      { ...base, id: "1", userId: "x", body: "", createdAt: hoursAgo(2) },
      { ...base, id: "3", userId: "bad", body: "", createdAt: hoursAgo(1) },
      { ...base, id: "4", userId: "x", body: "", createdAt: hoursAgo(1), removedAt: hoursAgo(0) },
    ];
    expect(visibleReplies(replies, new Set(["bad"]), false).map((r) => r.id)).toEqual(["1", "2"]);
    expect(visibleReplies(replies, new Set(["bad"]), true).map((r) => r.id)).toEqual(["1", "2", "4"]);
  });

  it("counts reactions by emoji and moves yours between them", () => {
    let counts = applyReaction({ like: 2 }, undefined, "love");
    expect(counts).toEqual({ like: 2, love: 1 });
    counts = applyReaction(counts, "love", "haha");
    expect(counts).toEqual({ like: 2, haha: 1 });
    counts = applyReaction(counts, "haha", null);
    expect(counts).toEqual({ like: 2 });
    expect(topReactions({ like: 1, yay: 9, love: 4, wow: 2 })).toEqual(["yay", "love", "wow"]);
    expect(topReactions({})).toEqual([]);
  });

  it("shortens long posts on a word boundary", () => {
    expect(excerpt("one two three four", 9)).toBe("one two…");
    expect(excerpt("short")).toBe("short");
  });
});

describe("meetups", () => {
  const at = (h: number) => new Date(NOW + h * 3600000).toISOString();
  const m = (over: Partial<Meetup> = {}): Meetup => ({ startsAt: at(24), endsAt: at(27), placeName: "Café", address: "1 Main St", goingCount: 0, maybeCount: 0, ...over });
  const plan = { title: "Thrift crawl", body: "", startsAt: at(24), endsAt: at(26), placeName: "Café", address: "" };

  it("checks a meetup before it's posted", () => {
    expect(meetupProblem(plan, NOW)).toBeNull();
    expect(meetupProblem({ ...plan, title: "x" }, NOW)).toMatch(/name/);
    expect(meetupProblem({ ...plan, startsAt: at(-1), endsAt: undefined }, NOW)).toMatch(/passed/);
    expect(meetupProblem({ ...plan, startsAt: at(-1), endsAt: undefined }, NOW, true)).toBeNull(); // editing an old one is fine
    expect(meetupProblem({ ...plan, endsAt: at(23) }, NOW)).toMatch(/after the start/);
    expect(meetupProblem({ ...plan, placeName: " " }, NOW)).toMatch(/where/);
    expect(meetupProblem({ ...plan, capacity: 1 }, NOW)).toMatch(/Spots/);
    expect(meetupProblem({ ...plan, capacity: 10 }, NOW)).toBeNull();
    expect(meetupProblem({ ...plan, startsAt: "" }, NOW)).toMatch(/date/);
  });

  it("knows when a meetup is upcoming, happening, past or cancelled", () => {
    expect(meetupState(m(), NOW)).toBe("upcoming");
    expect(meetupState(m({ startsAt: at(-1), endsAt: at(1) }), NOW)).toBe("happening");
    expect(meetupState(m({ startsAt: at(-2), endsAt: undefined }), NOW)).toBe("happening"); // three hours with no end time
    expect(meetupState(m({ startsAt: at(-5), endsAt: undefined }), NOW)).toBe("past");
    expect(meetupState(m({ cancelledAt: at(-1) }), NOW)).toBe("cancelled");
  });

  it("fills up, but lets you keep or change your own answer", () => {
    expect(isFull(m({ capacity: 3, goingCount: 3 }))).toBe(true);
    expect(isFull(m({ capacity: 3, goingCount: 3, myRsvp: "going" }))).toBe(false);
    expect(isFull(m({ goingCount: 300 }))).toBe(false);
    const after = applyRsvp(m({ goingCount: 2, maybeCount: 1, myRsvp: "maybe" }), "going");
    expect([after.goingCount, after.maybeCount, after.myRsvp]).toEqual([3, 0, "going"]);
    const gone = applyRsvp(after, null);
    expect([gone.goingCount, gone.maybeCount, gone.myRsvp]).toEqual([2, 0, undefined]);
  });

  it("lists upcoming meetups soonest first and past ones latest first", () => {
    const posts = [
      post({ id: "later", meetup: m({ startsAt: at(48), endsAt: undefined }) }),
      post({ id: "soon", meetup: m({ startsAt: at(2), endsAt: undefined }) }),
      post({ id: "old", meetup: m({ startsAt: at(-100), endsAt: undefined }) }),
      post({ id: "off", meetup: m({ cancelledAt: at(-1) }) }),
      post({ id: "plain" }),
    ];
    const { upcoming, past } = splitMeetups(posts, NOW);
    expect(upcoming.map((p) => p.id)).toEqual(["soon", "later"]);
    expect(past.map((p) => p.id)).toEqual(["off", "old"]);
  });

  it("makes a calendar file and a directions link", () => {
    const ics = meetupIcs({ id: "abc", title: "Packing party, pizza; fun", body: "Bring tape\nand mailers", authorName: "Lena", meetup: m() }, "https://hubby.app/#/community?post=abc", NOW);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Packing party\\, pizza\\; fun");
    expect(ics).toContain(`DTSTART:${at(24).replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`);
    expect(ics).toContain("UID:meetup-abc@hubby");
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
    expect(mapsUrl("Bean There", "214 Main St")).toBe("https://www.google.com/maps/search/?api=1&query=Bean%20There%2C%20214%20Main%20St");
  });

  it("finds meetups by their place when searching", () => {
    expect(filterPosts([post({ id: "x", meetup: m({ placeName: "Goodwill on 5th" }) })], { search: "goodwill" })).toHaveLength(1);
  });
});

describe("demo community", () => {
  let c: LocalCommunity;
  beforeEach(() => {
    localStorage.clear();
    c = new LocalCommunity();
  });

  it("starts with sample posts whose reply counts match their replies", async () => {
    const s = sampleCommunity(NOW);
    for (const p of s.posts) expect(p.replyCount).toBe(s.replies.filter((r) => r.postId === p.id).length);
    expect((await c.listPosts()).length).toBe(s.posts.length);
  });

  it("posts, comments and reactions", async () => {
    const p = await c.createPost({ category: "questions", title: "", body: "Best tape? Asking for a friend" }, "Me");
    expect(p.mine).toBe(true);
    const r = await c.reply(p.id, "Packing tape from the dollar store", "Me");
    await c.react("post", p.id, "like");
    await c.react("post", p.id, "like"); // twice counts once
    let got = (await c.getPost(p.id)).post;
    expect(got?.replyCount).toBe(1);
    expect([got?.likeCount, got?.myReaction]).toEqual([1, "like"]);
    await c.react("post", p.id, "love"); // changing your reaction doesn't add one
    got = (await c.getPost(p.id)).post;
    expect([got?.likeCount, got?.myReaction, got?.reactions]).toEqual([1, "love", { love: 1 }]);
    await c.react("post", p.id, null);
    expect((await c.getPost(p.id)).post?.likeCount).toBe(0);
    await c.react("reply", r.id, "like");
    expect((await c.repliesFor([p.id]))[0]).toMatchObject({ likeCount: 1, likedByMe: true });
  });

  it("plans a meetup, takes RSVPs and keeps to the spots", async () => {
    const soon = new Date(Date.now() + 86400000).toISOString();
    const p = await c.createMeetup({ title: "Packing party", body: "", startsAt: soon, placeName: "My place", address: "Oak Park", capacity: 2 }, "Me");
    expect(p.category).toBe("meetups");
    expect(p.meetup).toMatchObject({ placeName: "My place", goingCount: 1, myRsvp: "going", capacity: 2 }); // the host is going
    await c.rsvp(p.id, "maybe", "Me");
    expect((await c.getPost(p.id)).post?.meetup).toMatchObject({ goingCount: 0, maybeCount: 1, myRsvp: "maybe" });
    await c.rsvp(p.id, null, "Me");
    expect((await c.getPost(p.id)).post?.meetup?.myRsvp).toBeUndefined();
    expect(await c.attendees(p.id)).toEqual([]);

    // With the sample packing party full (6 of 6), Going is refused but Maybe works.
    const s = sampleCommunity();
    s.meetups.find((x) => x.postId === "cp-m2")!.capacity = 6;
    localStorage.setItem("reship.community.v2", JSON.stringify(s));
    const full = new LocalCommunity();
    await expect(full.rsvp("cp-m2", "going", "Me")).rejects.toThrow(/full/);
    await full.rsvp("cp-m2", "maybe", "Me");
    expect((await full.attendees("cp-m2")).find((a) => a.mine)?.status).toBe("maybe");

    // Cancelled and past meetups take no RSVPs.
    await c.setMeetupCancelled(p.id, true);
    await expect(c.rsvp(p.id, "going", "Me")).rejects.toThrow(/cancelled/);
    await c.setMeetupCancelled(p.id, false);
    await expect(c.rsvp("cp-m0", "going", "Me")).rejects.toThrow(/already happened/);

    // Hosts can change the details, and deleting removes the RSVPs too.
    const later = new Date(Date.now() + 2 * 86400000).toISOString();
    await c.editMeetup(p.id, { title: "Packing party v2", body: "Pizza!", startsAt: later, placeName: "Lena's", address: "", capacity: undefined });
    const edited = (await c.getPost(p.id)).post!;
    expect([edited.title, edited.meetup?.placeName, edited.meetup?.capacity, edited.meetup?.startsAt]).toEqual(["Packing party v2", "Lena's", undefined, later]);
    await c.deletePost(p.id);
    expect((await c.getPost(p.id)).post).toBeNull();
  });

  it("only lets the host edit or cancel a meetup", async () => {
    await c.setMeetupCancelled("cp-m1", true);
    expect((await c.getPost("cp-m1")).post?.meetup?.cancelledAt).toBeUndefined();
  });

  it("leaves blocked sellers off the guest list", async () => {
    expect((await c.attendees("cp-m1")).some((a) => a.userId === "u-dre")).toBe(true);
    await c.block("u-dre", "Dre Resells");
    expect((await c.attendees("cp-m1")).some((a) => a.userId === "u-dre")).toBe(false);
  });

  it("hides a post on the third report and lets an admin decide", async () => {
    // The sample spam post already has two reports; yours is the third.
    await c.report("post", "cp-6", "spam");
    await c.report("post", "cp-6", "spam"); // reporting twice counts once
    expect((await c.getPost("cp-6")).post?.removedAt).toBeTruthy();
    const queued = (await c.admin.queue()).find((q) => q.targetId === "cp-6");
    expect(queued?.reportCount).toBe(3);
    await c.admin.moderate("post", "cp-6", "restore");
    expect((await c.getPost("cp-6")).post?.removedAt).toBeUndefined();
    expect((await c.admin.queue()).some((q) => q.targetId === "cp-6")).toBe(false);
  });

  it("stops a banned seller from posting until the ban is lifted", async () => {
    await c.admin.ban("demo-me", "Me", "test");
    expect((await c.me()).banned).toBe(true);
    await expect(c.createPost({ category: "tips", title: "Hello there", body: "x" }, "Me")).rejects.toThrow();
    await c.admin.unban("demo-me");
    await expect(c.createPost({ category: "tips", title: "Hello there", body: "x" }, "Me")).resolves.toBeTruthy();
  });

  it("keeps a block list and never blocks yourself", async () => {
    await c.block("u-promo", "BestDeals4U");
    await c.block("demo-me", "Me");
    expect((await c.blocked()).map((b) => b.userId)).toEqual(["u-promo"]);
    await c.unblock("u-promo");
    expect(await c.blocked()).toEqual([]);
  });
});
