// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { type CommunityPost, authorNameFrom, excerpt, filterPosts, hotScore, postProblem, replyProblem, sortPosts, visibleReplies } from "./community";
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
  ...over,
});

describe("community rules", () => {
  it("checks posts and replies before sending", () => {
    expect(postProblem({ category: "tips", title: "hi", body: "x" })).toMatch(/title/);
    expect(postProblem({ category: "tips", title: "Good title", body: "  " })).toMatch(/Write/);
    expect(postProblem({ category: "tips", title: "Good title", body: "ok" })).toBeNull();
    expect(replyProblem(" ")).toMatch(/reply/);
    expect(replyProblem("x".repeat(5001))).toMatch(/5,000/);
  });

  it("never falls back to an email for the author name", () => {
    expect(authorNameFrom("  Maya's Closet ")).toBe("Maya's Closet");
    expect(authorNameFrom("")).toBe("SellSync seller");
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

  it("shortens long posts on a word boundary", () => {
    expect(excerpt("one two three four", 9)).toBe("one two…");
    expect(excerpt("short")).toBe("short");
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

  it("posts, replies and likes", async () => {
    const p = await c.createPost({ category: "questions", title: "Best tape?", body: "Asking for a friend" }, "Me");
    expect(p.mine).toBe(true);
    await c.reply(p.id, "Packing tape from the dollar store", "Me");
    await c.setLiked("post", p.id, true);
    await c.setLiked("post", p.id, true); // twice counts once
    const { post: got, replies } = await c.getPost(p.id);
    expect(got?.replyCount).toBe(1);
    expect(got?.likeCount).toBe(1);
    expect(got?.likedByMe).toBe(true);
    expect(replies).toHaveLength(1);
    await c.setLiked("post", p.id, false);
    expect((await c.getPost(p.id)).post?.likeCount).toBe(0);
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
