// Community: the Hubby group. A feed where resellers post, comment and react, and in-person
// meetups they plan together. Types and the rules both backends share.

export type CommunityCategory = "tips" | "questions" | "shipping" | "sourcing" | "wins" | "news" | "ideas" | "chat" | "meetups";
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
  { id: "ideas", label: "Ideas", hint: "Thoughts on reselling or Hubby" },
  { id: "chat", label: "Just chatting", hint: "Anything else" },
  { id: "meetups", label: "Meetups", hint: "Get together in person" },
];
// Topics you can pick for a plain post. Meetup posts are made with the meetup form.
export const POST_TOPICS = CATEGORIES.filter((c) => c.id !== "meetups");
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

// Reactions on a post. Comments keep a simple like.
export type ReactionType = "like" | "love" | "haha" | "wow" | "yay";
export const REACTIONS: { id: ReactionType; emoji: string; label: string }[] = [
  { id: "like", emoji: "👍", label: "Like" },
  { id: "love", emoji: "❤️", label: "Love" },
  { id: "haha", emoji: "😂", label: "Haha" },
  { id: "wow", emoji: "😮", label: "Wow" },
  { id: "yay", emoji: "🎉", label: "Yay" },
];
export const isReaction = (r: unknown): r is ReactionType => REACTIONS.some((x) => x.id === r);
export const reactionOf = (r: ReactionType) => REACTIONS.find((x) => x.id === r)!;
export type ReactionCounts = Partial<Record<ReactionType, number>>;

// The reactions people used most on a post, biggest first, for the little emoji stack.
export function topReactions(counts: ReactionCounts | undefined, n = 3): ReactionType[] {
  return REACTIONS.map((r) => r.id)
    .filter((id) => (counts?.[id] ?? 0) > 0)
    .sort((a, b) => (counts![b] ?? 0) - (counts![a] ?? 0))
    .slice(0, n);
}

// Moving your reaction from one emoji to another (or taking it back) changes the counts by one.
export function applyReaction(counts: ReactionCounts, from: ReactionType | undefined, to: ReactionType | null): ReactionCounts {
  const next = { ...counts };
  if (from) next[from] = Math.max(0, (next[from] ?? 0) - 1);
  if (to) next[to] = (next[to] ?? 0) + 1;
  for (const k of Object.keys(next) as ReactionType[]) if (!next[k]) delete next[k];
  return next;
}

export const reactionTotal = (counts: ReactionCounts | undefined) => Object.values(counts ?? {}).reduce((a, b) => a + (b ?? 0), 0);

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
  // Every reaction counts once in likeCount; this splits them by emoji.
  reactions: ReactionCounts;
  myReaction?: ReactionType;
  // Set when the post is a meetup: its comments are the meetup's discussion.
  meetup?: Meetup;
}

// ---------- Meetups ----------

export type RsvpStatus = "going" | "maybe";

export interface Meetup {
  startsAt: string;
  endsAt?: string;
  placeName: string;
  address: string;
  capacity?: number;
  cancelledAt?: string;
  goingCount: number;
  maybeCount: number;
  myRsvp?: RsvpStatus;
}

export interface Attendee {
  userId: string;
  name: string;
  status: RsvpStatus;
  createdAt: string;
  mine: boolean;
}

export interface NewMeetup {
  title: string;
  body: string;
  startsAt: string;
  endsAt?: string;
  placeName: string;
  address: string;
  capacity?: number;
}

export const MEETUP_LIMITS = { place: 120, address: 300, capacity: 500 };

export function meetupProblem(m: NewMeetup, now = Date.now(), editing = false): string | null {
  const title = m.title.trim();
  if (title.length < 3) return "Give the meetup a name (3 characters or more).";
  if (title.length > LIMITS.title) return `Keep the name under ${LIMITS.title} characters.`;
  const start = Date.parse(m.startsAt);
  if (Number.isNaN(start)) return "Pick a date and start time.";
  if (!editing && start < now) return "Pick a time that hasn't passed yet.";
  if (m.endsAt) {
    const end = Date.parse(m.endsAt);
    if (Number.isNaN(end) || end <= start) return "The end time needs to be after the start.";
    if (end - start > 3 * 86400000) return "Keep a meetup under three days.";
  }
  if (!m.placeName.trim()) return "Say where you're meeting.";
  if (m.placeName.length > MEETUP_LIMITS.place) return `Keep the place name under ${MEETUP_LIMITS.place} characters.`;
  if (m.address.length > MEETUP_LIMITS.address) return `Keep the address under ${MEETUP_LIMITS.address} characters.`;
  if (m.capacity !== undefined && (!Number.isInteger(m.capacity) || m.capacity < 2 || m.capacity > MEETUP_LIMITS.capacity))
    return `Spots should be a whole number from 2 to ${MEETUP_LIMITS.capacity}, or leave it empty.`;
  if (m.body.length > LIMITS.body) return `Keep the details under ${LIMITS.body.toLocaleString()} characters.`;
  return null;
}

export type MeetupState = "upcoming" | "happening" | "past" | "cancelled";

// A meetup with no end time counts as happening for three hours after it starts.
export function meetupState(m: Pick<Meetup, "startsAt" | "endsAt" | "cancelledAt">, now = Date.now()): MeetupState {
  if (m.cancelledAt) return "cancelled";
  const start = Date.parse(m.startsAt);
  const end = m.endsAt ? Date.parse(m.endsAt) : start + 3 * 3600000;
  if (now < start) return "upcoming";
  if (now <= end) return "happening";
  return "past";
}

export const spotsLeft = (m: Pick<Meetup, "capacity" | "goingCount">) => (m.capacity ? Math.max(0, m.capacity - m.goingCount) : undefined);
// Full means nobody new can say Going. You can still change your own answer, or say Maybe.
export const isFull = (m: Pick<Meetup, "capacity" | "goingCount" | "myRsvp">) => !!m.capacity && m.goingCount >= m.capacity && m.myRsvp !== "going";

// RSVP counts after you change your answer, for an instant update before the server confirms.
export function applyRsvp(m: Meetup, to: RsvpStatus | null): Meetup {
  const next = { ...m, myRsvp: to ?? undefined };
  if (m.myRsvp === "going") next.goingCount = Math.max(0, next.goingCount - 1);
  if (m.myRsvp === "maybe") next.maybeCount = Math.max(0, next.maybeCount - 1);
  if (to === "going") next.goingCount++;
  if (to === "maybe") next.maybeCount++;
  return next;
}

// Upcoming meetups soonest first; past and cancelled ones most recent first.
export function splitMeetups(posts: CommunityPost[], now = Date.now()) {
  const meetups = posts.filter((p): p is CommunityPost & { meetup: Meetup } => !!p.meetup);
  const upcoming = meetups.filter((p) => ["upcoming", "happening"].includes(meetupState(p.meetup, now))).sort((a, b) => a.meetup.startsAt.localeCompare(b.meetup.startsAt));
  const past = meetups.filter((p) => ["past", "cancelled"].includes(meetupState(p.meetup, now))).sort((a, b) => b.meetup.startsAt.localeCompare(a.meetup.startsAt));
  return { upcoming, past };
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const timeOf = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

// "Sat, Dec 6 · 10:00 AM – 1:00 PM", in the viewer's own time zone.
export function meetupWhen(startsAt: string, endsAt?: string): string {
  const s = new Date(startsAt);
  const day = s.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: s.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
  if (!endsAt) return `${day} · ${timeOf(s)}`;
  const e = new Date(endsAt);
  if (sameDay(s, e)) return `${day} · ${timeOf(s)} – ${timeOf(e)}`;
  return `${day} ${timeOf(s)} – ${e.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} ${timeOf(e)}`;
}

export const mapsUrl = (placeName: string, address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([placeName, address].filter((x) => x.trim()).join(", "))}`;

// A calendar file (.ics) for Add to calendar. Works with Apple, Google and Outlook calendars.
export function meetupIcs(post: Pick<CommunityPost, "id" | "title" | "body" | "authorName"> & { meetup: Meetup }, link: string, now = Date.now()): string {
  const stamp = (iso: string | number) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const m = post.meetup;
  const end = m.endsAt ?? new Date(Date.parse(m.startsAt) + 2 * 3600000).toISOString();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hubby//Meetups//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:meetup-${post.id}@hubby`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(m.startsAt)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(post.title)}`,
    `LOCATION:${esc([m.placeName, m.address].filter((x) => x.trim()).join(", "))}`,
    `DESCRIPTION:${esc(`${post.body ? `${post.body}\n\n` : ""}Hosted by ${post.authorName} on Hubby: ${link}`)}`,
    `URL:${link}`,
    m.cancelledAt ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // Calendar files wrap long lines at 75 characters, continuing with a space.
  return lines.map((l) => (l.length <= 75 ? l : l.match(/.{1,74}/g)!.join("\r\n "))).join("\r\n") + "\r\n";
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
// Posts read like a group feed: the words are what matter, and a headline is optional.
export function postProblem(p: NewPost): string | null {
  const title = p.title.trim();
  if (title.length > LIMITS.title) return `Keep the headline under ${LIMITS.title} characters.`;
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
  return name || "Hubby seller";
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
  // Meetups are posts too, matched by their place as well as their words.
  const q = (f.search ?? "").trim().toLowerCase();
  return posts.filter((p) => {
    if (f.blocked?.has(p.userId) && !p.mine) return false;
    if (p.removedAt && !p.mine && !f.showRemoved) return false;
    if (f.category === "mine" && !p.mine) return false;
    if (f.category && f.category !== "all" && f.category !== "mine" && p.category !== f.category) return false;
    if (q && !`${p.title}\n${p.body}\n${p.authorName}\n${p.meetup?.placeName ?? ""}\n${p.meetup?.address ?? ""}`.toLowerCase().includes(q)) return false;
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
