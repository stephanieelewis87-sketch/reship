// Community: sellers trading tips, questions and ideas. Types and the rules both backends share.

export type CommunityCategory = "tips" | "questions" | "shipping" | "sourcing" | "wins" | "news" | "ideas" | "chat";
export type ContentKind = "post" | "reply";
export type ReportReason = "spam" | "harassment" | "scam" | "off_topic" | "other";
export type CommunitySort = "active" | "new" | "top";

export const CATEGORIES: { id: CommunityCategory; label: string; hint: string }[] = [
  { id: "tips", label: "Tips", hint: "Something that works for you" },
  { id: "questions", label: "Questions", hint: "Ask other sellers" },
  { id: "shipping", label: "Shipping", hint: "Labels, carriers, packing" },
  { id: "sourcing", label: "Sourcing", hint: "Where and what to buy" },
  { id: "wins", label: "Wins", hint: "Big sales and milestones" },
  { id: "news", label: "Marketplace news", hint: "Fee and policy changes" },
  { id: "ideas", label: "Ideas", hint: "Thoughts on reselling or SellSync" },
  { id: "chat", label: "Just chatting", hint: "Anything else" },
];
export const categoryLabel = (c: CommunityCategory) => CATEGORIES.find((x) => x.id === c)?.label ?? c;

export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: "spam", label: "Spam or self-promotion" },
  { id: "scam", label: "Scam or fraud" },
  { id: "harassment", label: "Rude, hateful or harassing" },
  { id: "off_topic", label: "Doesn't belong here" },
  { id: "other", label: "Something else" },
];
export const reasonLabel = (r: ReportReason) => REPORT_REASONS.find((x) => x.id === r)?.label ?? r;

// Reports from this many different sellers hide a post or reply until an admin looks at it.
export const AUTO_HIDE_REPORTS = 3;

export const LIMITS = { title: 140, body: 10000, reply: 5000, name: 60, note: 1000 };

export interface CommunityPost {
  id: string;
  userId: string;
  authorName: string;
  category: CommunityCategory;
  title: string;
  body: string;
  likeCount: number;
  replyCount: number;
  lastActivityAt: string;
  createdAt: string;
  editedAt?: string;
  removedAt?: string;
  removedReason?: string;
  likedByMe: boolean;
  mine: boolean;
}

export interface CommunityReply {
  id: string;
  postId: string;
  userId: string;
  authorName: string;
  body: string;
  likeCount: number;
  createdAt: string;
  removedAt?: string;
  removedReason?: string;
  likedByMe: boolean;
  mine: boolean;
}

export interface CommunityMe {
  userId: string;
  isAdmin: boolean;
  banned: boolean;
}

export interface BlockedSeller {
  userId: string;
  name: string;
  createdAt: string;
}

export interface BannedSeller {
  userId: string;
  name: string;
  reason?: string;
  createdAt: string;
}

// One reported post or reply in the admin's queue, with every open report on it rolled up.
export interface ReportedItem {
  kind: ContentKind;
  targetId: string;
  postId: string;
  authorId: string;
  authorName: string;
  title: string; // the post's title (for a reply, the title of the post it's on)
  body: string;
  removedAt?: string;
  reportCount: number;
  reasons: ReportReason[];
  notes: string[];
  firstReportedAt: string;
}

export interface NewPost {
  category: CommunityCategory;
  title: string;
  body: string;
}

// What a post or reply needs before it's sent. Returns the problem, or null when it's fine.
export function postProblem(p: NewPost): string | null {
  const title = p.title.trim();
  if (title.length < 3) return "Give your post a title (3 characters or more).";
  if (title.length > LIMITS.title) return `Keep the title under ${LIMITS.title} characters.`;
  if (!p.body.trim()) return "Write something in the post.";
  if (p.body.length > LIMITS.body) return `Keep the post under ${LIMITS.body.toLocaleString()} characters.`;
  if (!CATEGORIES.some((c) => c.id === p.category)) return "Pick a category.";
  return null;
}

export function replyProblem(body: string): string | null {
  if (!body.trim()) return "Write a reply first.";
  if (body.length > LIMITS.reply) return `Keep replies under ${LIMITS.reply.toLocaleString()} characters.`;
  return null;
}

// The name shown on posts: the shop name from Settings, never the email address.
export function authorNameFrom(displayName: string | undefined): string {
  const name = (displayName ?? "").trim().slice(0, LIMITS.name);
  return name || "SellSync seller";
}

// "Top" favours likes and replies but lets new posts compete: score fades with age in days.
export function hotScore(p: Pick<CommunityPost, "likeCount" | "replyCount" | "createdAt">, now = Date.now()): number {
  const ageDays = Math.max(0, (now - Date.parse(p.createdAt)) / 86400000);
  return (p.likeCount + 2 * p.replyCount + 1) / Math.pow(ageDays + 2, 1.5);
}

export function sortPosts(posts: CommunityPost[], sort: CommunitySort, now = Date.now()): CommunityPost[] {
  const list = [...posts];
  if (sort === "new") list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  else if (sort === "active") list.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  else list.sort((a, b) => hotScore(b, now) - hotScore(a, now));
  return list;
}

export interface FeedFilter {
  category?: CommunityCategory | "all" | "mine";
  search?: string;
  blocked?: Set<string>;
  showRemoved?: boolean; // admins see hidden posts in the feed, marked as hidden
}

export function filterPosts(posts: CommunityPost[], f: FeedFilter): CommunityPost[] {
  const q = (f.search ?? "").trim().toLowerCase();
  return posts.filter((p) => {
    if (f.blocked?.has(p.userId) && !p.mine) return false;
    if (p.removedAt && !p.mine && !f.showRemoved) return false;
    if (f.category === "mine" && !p.mine) return false;
    if (f.category && f.category !== "all" && f.category !== "mine" && p.category !== f.category) return false;
    if (q && !`${p.title}\n${p.body}\n${p.authorName}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function visibleReplies(replies: CommunityReply[], blocked: Set<string>, isAdmin: boolean): CommunityReply[] {
  return replies
    .filter((r) => (r.mine || !blocked.has(r.userId)) && (r.mine || isAdmin || !r.removedAt))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: d > 300 ? "numeric" : undefined });
}

// The first lines of a post for the feed card.
export function excerpt(body: string, max = 220): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max).replace(/\s+\S*$/, "")}…`;
}
