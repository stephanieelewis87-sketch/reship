import type {
  BannedSeller,
  BlockedSeller,
  CommunityCategory,
  CommunityMe,
  CommunityPost,
  CommunityReply,
  ContentKind,
  NewPost,
  ReportReason,
  ReportedItem,
} from "./community";
import { AUTO_HIDE_REPORTS } from "./community";
import { supabase } from "./supabase";

export type ModerationAction = "remove" | "restore" | "dismiss";

// The Community's data, behind the same two backends as the rest of the app.
export interface CommunityApi {
  me(): Promise<CommunityMe>;
  // The most recently active posts. Blocked sellers and hidden posts are filtered by the page.
  listPosts(): Promise<CommunityPost[]>;
  getPost(id: string): Promise<{ post: CommunityPost | null; replies: CommunityReply[] }>;
  createPost(p: NewPost, authorName: string): Promise<CommunityPost>;
  editPost(id: string, p: NewPost): Promise<void>;
  deletePost(id: string): Promise<void>;
  reply(postId: string, body: string, authorName: string): Promise<CommunityReply>;
  deleteReply(id: string): Promise<void>;
  setLiked(kind: ContentKind, id: string, liked: boolean): Promise<void>;
  // Reporting the same thing twice counts once.
  report(kind: ContentKind, id: string, reason: ReportReason, note?: string): Promise<void>;
  blocked(): Promise<BlockedSeller[]>;
  block(userId: string, name: string): Promise<void>;
  unblock(userId: string): Promise<void>;
  admin: {
    queue(): Promise<ReportedItem[]>;
    moderate(kind: ContentKind, id: string, action: ModerationAction, reason?: string): Promise<void>;
    bans(): Promise<BannedSeller[]>;
    ban(userId: string, name: string, reason?: string): Promise<void>;
    unban(userId: string): Promise<void>;
  };
}

// ---------- Demo mode: everything in this browser ----------

const KEY = "reship.community.v1";
const ME = "demo-me";
const HOUR = 3600000;
const ago = (hours: number, now: number) => new Date(now - hours * HOUR).toISOString();

interface StoredPost extends Omit<CommunityPost, "likedByMe" | "mine"> {}
interface StoredReply extends Omit<CommunityReply, "likedByMe" | "mine"> {}
interface StoredReport {
  reporterId: string;
  kind: ContentKind;
  targetId: string;
  reason: ReportReason;
  note?: string;
  status: "open" | "removed" | "dismissed";
  createdAt: string;
}
interface DemoState {
  posts: StoredPost[];
  replies: StoredReply[];
  likes: string[]; // `${kind}:${id}` liked by you
  reports: StoredReport[];
  blocks: BlockedSeller[];
  bans: BannedSeller[];
}

// A small, lively forum so the demo has something to read, reply to, report and moderate.
export function sampleCommunity(now = Date.now()): DemoState {
  const post = (
    id: string,
    userId: string,
    authorName: string,
    category: CommunityCategory,
    hours: number,
    title: string,
    body: string,
    likeCount: number,
  ): StoredPost => ({ id, userId, authorName, category, title, body, likeCount, replyCount: 0, createdAt: ago(hours, now), lastActivityAt: ago(hours, now) });
  const posts: StoredPost[] = [
    post(
      "cp-1",
      "u-maya",
      "Maya's Closet",
      "tips",
      5,
      "Photograph everything on the same wall at the same time of day",
      "I moved my photo setup next to a north-facing window and shoot between 10 and 2. My Poshmark listings finally look like a store instead of a garage sale, and I swear my likes went up. Bonus: no more editing every photo.",
      24,
    ),
    post(
      "cp-2",
      "u-dre",
      "Dre Resells",
      "questions",
      9,
      "Is anyone else seeing Mercari sales slow down this month?",
      "Views are about the same but offers dropped off a cliff for me in the last two weeks. Mostly sneakers and streetwear. Wondering if it's me or the platform.",
      7,
    ),
    post(
      "cp-3",
      "u-lena",
      "Thrifty Lena",
      "shipping",
      20,
      "Poly mailers vs boxes for denim: what I found after 200 orders",
      "Two pairs of jeans fit in a 12x15.5 poly mailer and stay under 2 lb almost every time. Boxes pushed me into the next weight tier way more often. Only exception: anything with metal hardware that could poke through, those still get a box.",
      31,
    ),
    post(
      "cp-4",
      "u-sam",
      "Sam Sources",
      "sourcing",
      30,
      "Bins on Tuesday morning are worth the drive",
      "Our local outlet restocks Monday night. Went Tuesday at open and pulled 14 items in an hour, 3 of them sold within the week. Bring gloves.",
      12,
    ),
    post(
      "cp-5",
      "u-maya",
      "Maya's Closet",
      "wins",
      46,
      "First $3k month!",
      "Took me a year and a half of listing every night after work. The thing that changed it was crosslisting everything to Depop and Mercari instead of Poshmark only. Thank you all for the tips in here.",
      58,
    ),
    post(
      "cp-6",
      "u-promo",
      "BestDeals4U",
      "chat",
      3,
      "Make $500/day with my reselling course!!!",
      "DM me for the secret method, only 10 spots left. Link in my bio.",
      0,
    ),
    post(
      "cp-7",
      "u-ivy",
      "Ivy Vintage",
      "news",
      70,
      "Heads up: eBay changed the promoted listings minimum",
      "Saw it in Seller Hub this morning. Check your campaigns before they quietly stop running.",
      9,
    ),
    post(
      "cp-8",
      "u-dre",
      "Dre Resells",
      "ideas",
      90,
      "Would love a way to share bundles of SKUs with a friend who helps me pack",
      "My cousin packs orders for me on weekends. It would be great to send her a list of what to pull with the bin locations.",
      5,
    ),
  ];
  const replies: StoredReply[] = [
    { id: "cr-1", postId: "cp-2", userId: "u-lena", authorName: "Thrifty Lena", body: "Same here. I've had better luck sending offers to likers on Sunday nights.", likeCount: 4, createdAt: ago(8, now) },
    { id: "cr-2", postId: "cp-2", userId: "u-sam", authorName: "Sam Sources", body: "It's seasonal for sneakers in my experience. It picks back up before the holidays.", likeCount: 2, createdAt: ago(6, now) },
    { id: "cr-3", postId: "cp-3", userId: "u-maya", authorName: "Maya's Closet", body: "This is so helpful. Saving this.", likeCount: 1, createdAt: ago(18, now) },
    { id: "cr-4", postId: "cp-5", userId: "u-ivy", authorName: "Ivy Vintage", body: "Huge! Congrats Maya 🎉", likeCount: 3, createdAt: ago(44, now) },
    { id: "cr-5", postId: "cp-5", userId: "u-promo", authorName: "BestDeals4U", body: "Want to make 10x that? Check my bio!!", likeCount: 0, createdAt: ago(40, now) },
    { id: "cr-6", postId: "cp-1", userId: "u-dre", authorName: "Dre Resells", body: "Do you use a white backdrop or just the wall?", likeCount: 0, createdAt: ago(4, now) },
  ];
  for (const r of replies) {
    const p = posts.find((x) => x.id === r.postId)!;
    p.replyCount++;
    if (r.createdAt > p.lastActivityAt) p.lastActivityAt = r.createdAt;
  }
  const report = (reporterId: string, kind: ContentKind, targetId: string, reason: ReportReason, hours: number, note?: string): StoredReport => ({
    reporterId,
    kind,
    targetId,
    reason,
    note,
    status: "open",
    createdAt: ago(hours, now),
  });
  const reports = [
    report("u-lena", "post", "cp-6", "spam", 2, "Same post shows up every few days."),
    report("u-sam", "post", "cp-6", "scam", 1),
    report("u-maya", "reply", "cr-5", "spam", 39),
  ];
  return { posts, replies, likes: ["post:cp-5"], reports, blocks: [], bans: [] };
}

export class LocalCommunity implements CommunityApi {
  private state: DemoState | null = null;
  private load(): DemoState {
    if (!this.state) {
      try {
        this.state = JSON.parse(localStorage.getItem(KEY) ?? "null") as DemoState | null;
      } catch {
        this.state = null;
      }
      this.state ??= sampleCommunity();
    }
    return this.state;
  }
  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      // Storage blocked (private window); the demo keeps working in memory.
    }
  }
  reset() {
    this.state = null;
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Nothing saved.
    }
  }

  private viewPost = (p: StoredPost): CommunityPost => ({ ...p, likedByMe: this.load().likes.includes(`post:${p.id}`), mine: p.userId === ME });
  private viewReply = (r: StoredReply): CommunityReply => ({ ...r, likedByMe: this.load().likes.includes(`reply:${r.id}`), mine: r.userId === ME });
  private banned = () => this.load().bans.some((b) => b.userId === ME);

  // In demo mode you're the owner, so the moderator tools show too (as on the Feedback page).
  me = async (): Promise<CommunityMe> => ({ userId: ME, isAdmin: true, banned: this.banned() });

  listPosts = async () => this.load().posts.map(this.viewPost);

  getPost = async (id: string) => {
    const s = this.load();
    const p = s.posts.find((x) => x.id === id);
    return { post: p ? this.viewPost(p) : null, replies: s.replies.filter((r) => r.postId === id).map(this.viewReply) };
  };

  createPost = async (p: NewPost, authorName: string) => {
    if (this.banned()) throw new Error("You can't post in the Community right now.");
    const now = new Date().toISOString();
    const row: StoredPost = { id: crypto.randomUUID(), userId: ME, authorName, ...p, likeCount: 0, replyCount: 0, createdAt: now, lastActivityAt: now };
    this.load().posts.unshift(row);
    this.save();
    return this.viewPost(row);
  };

  editPost = async (id: string, p: NewPost) => {
    const row = this.load().posts.find((x) => x.id === id && x.userId === ME);
    if (row) Object.assign(row, p, { editedAt: new Date().toISOString() });
    this.save();
  };

  deletePost = async (id: string) => {
    const s = this.load();
    s.posts = s.posts.filter((p) => p.id !== id);
    s.replies = s.replies.filter((r) => r.postId !== id);
    this.save();
  };

  reply = async (postId: string, body: string, authorName: string) => {
    if (this.banned()) throw new Error("You can't reply in the Community right now.");
    const s = this.load();
    const post = s.posts.find((p) => p.id === postId);
    if (!post || post.removedAt) throw new Error("This post isn't taking replies.");
    const row: StoredReply = { id: crypto.randomUUID(), postId, userId: ME, authorName, body, likeCount: 0, createdAt: new Date().toISOString() };
    s.replies.push(row);
    post.replyCount++;
    post.lastActivityAt = row.createdAt;
    this.save();
    return this.viewReply(row);
  };

  deleteReply = async (id: string) => {
    const s = this.load();
    const r = s.replies.find((x) => x.id === id);
    if (!r) return;
    s.replies = s.replies.filter((x) => x.id !== id);
    const post = s.posts.find((p) => p.id === r.postId);
    if (post) post.replyCount = Math.max(0, post.replyCount - 1);
    this.save();
  };

  setLiked = async (kind: ContentKind, id: string, liked: boolean) => {
    const s = this.load();
    const key = `${kind}:${id}`;
    if (liked === s.likes.includes(key)) return;
    s.likes = liked ? [...s.likes, key] : s.likes.filter((k) => k !== key);
    const row = kind === "post" ? s.posts.find((p) => p.id === id) : s.replies.find((r) => r.id === id);
    if (row) row.likeCount = Math.max(0, row.likeCount + (liked ? 1 : -1));
    this.save();
  };

  report = async (kind: ContentKind, id: string, reason: ReportReason, note?: string) => {
    const s = this.load();
    if (s.reports.some((r) => r.reporterId === ME && r.kind === kind && r.targetId === id)) return;
    s.reports.push({ reporterId: ME, kind, targetId: id, reason, note: note?.trim() || undefined, status: "open", createdAt: new Date().toISOString() });
    const open = s.reports.filter((r) => r.kind === kind && r.targetId === id && r.status === "open").length;
    const row = kind === "post" ? s.posts.find((p) => p.id === id) : s.replies.find((r) => r.id === id);
    if (row && !row.removedAt && open >= AUTO_HIDE_REPORTS) {
      row.removedAt = new Date().toISOString();
      row.removedReason = `Hidden after ${AUTO_HIDE_REPORTS} reports, waiting for review`;
    }
    this.save();
  };

  blocked = async () => [...this.load().blocks];
  block = async (userId: string, name: string) => {
    const s = this.load();
    if (userId === ME || s.blocks.some((b) => b.userId === userId)) return;
    s.blocks.push({ userId, name, createdAt: new Date().toISOString() });
    this.save();
  };
  unblock = async (userId: string) => {
    const s = this.load();
    s.blocks = s.blocks.filter((b) => b.userId !== userId);
    this.save();
  };

  admin = {
    queue: async (): Promise<ReportedItem[]> => {
      const s = this.load();
      const groups = new Map<string, StoredReport[]>();
      for (const r of s.reports.filter((x) => x.status === "open")) {
        const k = `${r.kind}:${r.targetId}`;
        groups.set(k, [...(groups.get(k) ?? []), r]);
      }
      const items: ReportedItem[] = [];
      for (const list of groups.values()) {
        const { kind, targetId } = list[0];
        const post = kind === "post" ? s.posts.find((p) => p.id === targetId) : undefined;
        const reply = kind === "reply" ? s.replies.find((r) => r.id === targetId) : undefined;
        const row = post ?? reply;
        if (!row) continue;
        const parent = post ?? s.posts.find((p) => p.id === reply!.postId);
        items.push({
          kind,
          targetId,
          postId: parent?.id ?? "",
          authorId: row.userId,
          authorName: row.authorName,
          title: parent?.title ?? "",
          body: row.body,
          removedAt: row.removedAt,
          reportCount: list.length,
          reasons: [...new Set(list.map((r) => r.reason))],
          notes: list.flatMap((r) => (r.note ? [r.note] : [])),
          firstReportedAt: list.map((r) => r.createdAt).sort()[0],
        });
      }
      return items.sort((a, b) => b.reportCount - a.reportCount || a.firstReportedAt.localeCompare(b.firstReportedAt));
    },
    moderate: async (kind: ContentKind, id: string, action: ModerationAction, reason?: string) => {
      const s = this.load();
      const row = kind === "post" ? s.posts.find((p) => p.id === id) : s.replies.find((r) => r.id === id);
      if (row) {
        if (action === "remove") {
          row.removedAt = new Date().toISOString();
          row.removedReason = reason || "Removed by a moderator";
        } else {
          delete row.removedAt;
          delete row.removedReason;
        }
      }
      for (const r of s.reports) if (r.kind === kind && r.targetId === id && r.status === "open") r.status = action === "remove" ? "removed" : "dismissed";
      this.save();
    },
    bans: async () => [...this.load().bans],
    ban: async (userId: string, name: string, reason?: string) => {
      const s = this.load();
      if (s.bans.some((b) => b.userId === userId)) return;
      s.bans.push({ userId, name, reason: reason?.trim() || undefined, createdAt: new Date().toISOString() });
      this.save();
    },
    unban: async (userId: string) => {
      const s = this.load();
      s.bans = s.bans.filter((b) => b.userId !== userId);
      this.save();
    },
  };
}

// ---------- Accounts: Supabase (supabase/migrations/0014_community.sql) ----------

interface PostRow {
  id: string;
  user_id: string;
  author_name: string;
  category: CommunityCategory;
  title: string;
  body: string;
  like_count: number;
  reply_count: number;
  last_activity_at: string;
  removed_at: string | null;
  removed_reason: string | null;
  created_at: string;
  edited_at: string | null;
}
interface ReplyRow {
  id: string;
  post_id: string;
  user_id: string;
  author_name: string;
  body: string;
  like_count: number;
  removed_at: string | null;
  removed_reason: string | null;
  created_at: string;
}
interface QueueRow {
  kind: ContentKind;
  target_id: string;
  post_id: string;
  author_id: string;
  author_name: string;
  title: string | null;
  body: string;
  removed_at: string | null;
  report_count: number;
  reasons: ReportReason[];
  notes: string[] | null;
  first_reported_at: string;
}

const FEED_SIZE = 300;
// Postgres's "duplicate key" error, which a second like or report raises.
const DUPLICATE = "23505";

export class SupabaseCommunity implements CommunityApi {
  constructor(private userId: string) {}

  private get db() {
    if (!supabase) throw new Error("Supabase is not configured");
    return supabase;
  }

  private async likedSet(kind: ContentKind, ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const { data } = await this.db.from("community_likes").select("target_id").eq("user_id", this.userId).eq("kind", kind).in("target_id", ids);
    return new Set(((data ?? []) as { target_id: string }[]).map((r) => r.target_id));
  }

  private toPost = (r: PostRow, liked: Set<string>): CommunityPost => ({
    id: r.id,
    userId: r.user_id,
    authorName: r.author_name,
    category: r.category,
    title: r.title,
    body: r.body,
    likeCount: r.like_count,
    replyCount: r.reply_count,
    lastActivityAt: r.last_activity_at,
    createdAt: r.created_at,
    editedAt: r.edited_at ?? undefined,
    removedAt: r.removed_at ?? undefined,
    removedReason: r.removed_reason ?? undefined,
    likedByMe: liked.has(r.id),
    mine: r.user_id === this.userId,
  });

  private toReply = (r: ReplyRow, liked: Set<string>): CommunityReply => ({
    id: r.id,
    postId: r.post_id,
    userId: r.user_id,
    authorName: r.author_name,
    body: r.body,
    likeCount: r.like_count,
    createdAt: r.created_at,
    removedAt: r.removed_at ?? undefined,
    removedReason: r.removed_reason ?? undefined,
    likedByMe: liked.has(r.id),
    mine: r.user_id === this.userId,
  });

  async me(): Promise<CommunityMe> {
    const [admin, ban] = await Promise.all([
      this.db.from("app_admins").select("user_id").eq("user_id", this.userId).maybeSingle(),
      this.db.from("community_bans").select("user_id").eq("user_id", this.userId).maybeSingle(),
    ]);
    return { userId: this.userId, isAdmin: !admin.error && !!admin.data, banned: !ban.error && !!ban.data };
  }

  // Row-level security already leaves out hidden posts (except your own, or all for an admin)
  // and posts by sellers you blocked.
  async listPosts() {
    const { data, error } = await this.db.from("community_posts").select("*").order("last_activity_at", { ascending: false }).limit(FEED_SIZE);
    if (error) throw error;
    const rows = data as PostRow[];
    const liked = await this.likedSet(
      "post",
      rows.map((r) => r.id),
    );
    return rows.map((r) => this.toPost(r, liked));
  }

  async getPost(id: string) {
    const [p, r] = await Promise.all([
      this.db.from("community_posts").select("*").eq("id", id).maybeSingle(),
      this.db.from("community_replies").select("*").eq("post_id", id).order("created_at").limit(1000),
    ]);
    if (p.error) throw p.error;
    if (r.error) throw r.error;
    const replies = (r.data ?? []) as ReplyRow[];
    const [likedPost, likedReplies] = await Promise.all([
      this.likedSet("post", p.data ? [id] : []),
      this.likedSet(
        "reply",
        replies.map((x) => x.id),
      ),
    ]);
    return { post: p.data ? this.toPost(p.data as PostRow, likedPost) : null, replies: replies.map((x) => this.toReply(x, likedReplies)) };
  }

  async createPost(p: NewPost, authorName: string) {
    const { data, error } = await this.db
      .from("community_posts")
      .insert({ user_id: this.userId, author_name: authorName, category: p.category, title: p.title.trim(), body: p.body.trim() })
      .select("*")
      .single();
    if (error) throw friendly(error);
    return this.toPost(data as PostRow, new Set());
  }

  async editPost(id: string, p: NewPost) {
    const { error } = await this.db
      .from("community_posts")
      .update({ category: p.category, title: p.title.trim(), body: p.body.trim(), edited_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw friendly(error);
  }

  async deletePost(id: string) {
    const { error } = await this.db.from("community_posts").delete().eq("id", id);
    if (error) throw error;
  }

  async reply(postId: string, body: string, authorName: string) {
    const { data, error } = await this.db
      .from("community_replies")
      .insert({ post_id: postId, user_id: this.userId, author_name: authorName, body: body.trim() })
      .select("*")
      .single();
    if (error) throw friendly(error);
    return this.toReply(data as ReplyRow, new Set());
  }

  async deleteReply(id: string) {
    const { error } = await this.db.from("community_replies").delete().eq("id", id);
    if (error) throw error;
  }

  async setLiked(kind: ContentKind, id: string, liked: boolean) {
    if (liked) {
      const { error } = await this.db.from("community_likes").insert({ user_id: this.userId, kind, target_id: id });
      if (error && error.code !== DUPLICATE) throw error;
    } else {
      const { error } = await this.db.from("community_likes").delete().eq("user_id", this.userId).eq("kind", kind).eq("target_id", id);
      if (error) throw error;
    }
  }

  async report(kind: ContentKind, id: string, reason: ReportReason, note?: string) {
    const { error } = await this.db.from("community_reports").insert({ reporter_id: this.userId, kind, target_id: id, reason, note: note?.trim() || null });
    if (error && error.code !== DUPLICATE) throw error;
  }

  async blocked() {
    const { data, error } = await this.db.from("community_blocks").select("blocked_id, blocked_name, created_at").order("created_at", { ascending: false });
    if (error) return [];
    return ((data ?? []) as { blocked_id: string; blocked_name: string; created_at: string }[]).map((r) => ({ userId: r.blocked_id, name: r.blocked_name, createdAt: r.created_at }));
  }

  async block(userId: string, name: string) {
    const { error } = await this.db.from("community_blocks").insert({ blocker_id: this.userId, blocked_id: userId, blocked_name: name });
    if (error && error.code !== DUPLICATE) throw error;
  }

  async unblock(userId: string) {
    const { error } = await this.db.from("community_blocks").delete().eq("blocker_id", this.userId).eq("blocked_id", userId);
    if (error) throw error;
  }

  admin = {
    queue: async (): Promise<ReportedItem[]> => {
      const { data, error } = await this.db.rpc("community_report_queue");
      if (error) throw error;
      return ((data ?? []) as QueueRow[]).map((r) => ({
        kind: r.kind,
        targetId: r.target_id,
        postId: r.post_id,
        authorId: r.author_id,
        authorName: r.author_name,
        title: r.title ?? "",
        body: r.body,
        removedAt: r.removed_at ?? undefined,
        reportCount: Number(r.report_count),
        reasons: r.reasons ?? [],
        notes: r.notes ?? [],
        firstReportedAt: r.first_reported_at,
      }));
    },
    moderate: async (kind: ContentKind, id: string, action: ModerationAction, reason?: string) => {
      const { error } = await this.db.rpc("community_moderate", { p_kind: kind, p_id: id, p_action: action, p_reason: reason ?? null });
      if (error) throw error;
    },
    bans: async (): Promise<BannedSeller[]> => {
      const { data, error } = await this.db.from("community_bans").select("user_id, user_name, reason, created_at").order("created_at", { ascending: false });
      if (error) return [];
      return ((data ?? []) as { user_id: string; user_name: string; reason: string | null; created_at: string }[]).map((r) => ({
        userId: r.user_id,
        name: r.user_name,
        reason: r.reason ?? undefined,
        createdAt: r.created_at,
      }));
    },
    ban: async (userId: string, name: string, reason?: string) => {
      const { error } = await this.db.from("community_bans").insert({ user_id: userId, user_name: name, reason: reason?.trim() || null });
      if (error && error.code !== DUPLICATE) throw error;
    },
    unban: async (userId: string) => {
      const { error } = await this.db.from("community_bans").delete().eq("user_id", userId);
      if (error) throw error;
    },
  };
}

// Row-level security refusals read as database jargon; a refused post or reply almost always means
// a ban or a post that was taken down.
function friendly(error: { message: string; code?: string }): Error {
  if (error.code === "42501" || /row-level security/i.test(error.message)) return new Error("You can't post or reply in the Community right now.");
  return new Error(error.message);
}
