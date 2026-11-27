import type {
  Attendee,
  BannedSeller,
  BlockedSeller,
  CommunityCategory,
  CommunityMe,
  CommunityPost,
  CommunityReply,
  ContentKind,
  Meetup,
  NewMeetup,
  NewPost,
  ReactionCounts,
  ReactionType,
  ReportReason,
  ReportedItem,
  RsvpStatus,
} from "./community";
import { AUTO_HIDE_REPORTS, applyReaction, isFull, isReaction, meetupState, reactionTotal } from "./community";
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
  // The newest comments on several posts at once, for the feed's comment previews.
  repliesFor(postIds: string[]): Promise<CommunityReply[]>;
  // A post takes one reaction per person (null takes it back); a comment takes a like ("like").
  react(kind: ContentKind, id: string, reaction: ReactionType | null): Promise<void>;
  // Meetups: a post with a time and place. Its comments are the meetup's discussion.
  createMeetup(m: NewMeetup, authorName: string): Promise<CommunityPost>;
  editMeetup(postId: string, m: NewMeetup): Promise<void>;
  setMeetupCancelled(postId: string, cancelled: boolean): Promise<void>;
  // null means "can't go" and takes your RSVP off the list.
  rsvp(postId: string, status: RsvpStatus | null, name: string): Promise<void>;
  attendees(postId: string): Promise<Attendee[]>;
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

// The time-and-place part of a meetup, tidied, as both backends store it.
function meetupFields(m: NewMeetup) {
  return {
    startsAt: new Date(m.startsAt).toISOString(),
    endsAt: m.endsAt ? new Date(m.endsAt).toISOString() : undefined,
    placeName: m.placeName.trim(),
    address: m.address.trim(),
    capacity: m.capacity || undefined,
  };
}

// ---------- Demo mode: everything in this browser ----------

const KEY = "reship.community.v2";
const ME = "demo-me";
const HOUR = 3600000;
const ago = (hours: number, now: number) => new Date(now - hours * HOUR).toISOString();

interface StoredPost extends Omit<CommunityPost, "likedByMe" | "mine" | "myReaction" | "meetup"> {}
interface StoredReply extends Omit<CommunityReply, "likedByMe" | "mine"> {}
interface StoredMeetup extends Omit<Meetup, "myRsvp" | "goingCount" | "maybeCount"> {
  postId: string;
}
interface StoredRsvp {
  postId: string;
  userId: string;
  name: string;
  status: RsvpStatus;
  createdAt: string;
}
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
  likes: string[]; // `reply:${id}` liked by you
  reactions: Record<string, ReactionType>; // your reaction on each post
  reports: StoredReport[];
  blocks: BlockedSeller[];
  bans: BannedSeller[];
  meetups: StoredMeetup[];
  rsvps: StoredRsvp[];
}

// The next given weekday (0 = Sunday) at a local hour, at least a day away, as an ISO time.
function nextDay(weekday: number, hour: number, now: number, weeksOut = 0): string {
  const d = new Date(now + 86400000);
  d.setHours(hour, 0, 0, 0);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + 7 * weeksOut);
  return d.toISOString();
}

// A small, lively group so the demo has something to read, react to, comment on, RSVP to,
// report and moderate.
export function sampleCommunity(now = Date.now()): DemoState {
  const post = (
    id: string,
    userId: string,
    authorName: string,
    category: CommunityCategory,
    hours: number,
    title: string,
    body: string,
    reactions: ReactionCounts,
  ): StoredPost => ({
    id,
    userId,
    authorName,
    category,
    title,
    body,
    reactions,
    likeCount: reactionTotal(reactions),
    replyCount: 0,
    createdAt: ago(hours, now),
    lastActivityAt: ago(hours, now),
  });
  const posts: StoredPost[] = [
    post(
      "cp-m1",
      "u-ivy",
      "Ivy Vintage",
      "meetups",
      2,
      "Saturday thrift crawl + coffee ☕",
      "Let's hit the three thrift stores on Main together, then compare hauls over coffee. Hubbies welcome, someone has to carry the bags 😄 Bring cash for the bins.",
      { like: 9, love: 4, yay: 3 },
    ),
    post(
      "cp-1",
      "u-maya",
      "Maya's Closet",
      "tips",
      5,
      "",
      "Photograph everything on the same wall at the same time of day. I moved my photo setup next to a north-facing window and shoot between 10 and 2. My Poshmark listings finally look like a store instead of a garage sale, and I swear my likes went up. Bonus: no more editing every photo.",
      { like: 14, love: 8, wow: 2 },
    ),
    post(
      "cp-2",
      "u-dre",
      "Dre Resells",
      "questions",
      9,
      "",
      "Is anyone else seeing Mercari sales slow down this month? Views are about the same but offers dropped off a cliff for me in the last two weeks. Mostly sneakers and streetwear. Wondering if it's me or the platform.",
      { like: 5, wow: 2 },
    ),
    post(
      "cp-m2",
      "u-lena",
      "Thrifty Lena",
      "meetups",
      14,
      "Packing party and pizza night",
      "I've got a big folding table, a label printer and too many poly mailers. Bring your orders and let's pack together. I'll order pizza. Spots are limited by my living room!",
      { like: 6, love: 5 },
    ),
    post(
      "cp-3",
      "u-lena",
      "Thrifty Lena",
      "shipping",
      20,
      "Poly mailers vs boxes for denim: what I found after 200 orders",
      "Two pairs of jeans fit in a 12x15.5 poly mailer and stay under 2 lb almost every time. Boxes pushed me into the next weight tier way more often. Only exception: anything with metal hardware that could poke through, those still get a box.",
      { like: 18, love: 7, wow: 6 },
    ),
    post(
      "cp-4",
      "u-sam",
      "Sam Sources",
      "sourcing",
      30,
      "",
      "Bins on Tuesday morning are worth the drive. Our local outlet restocks Monday night. Went Tuesday at open and pulled 14 items in an hour, 3 of them sold within the week. Bring gloves. My husband now calls Tuesday 'bin day' and plans his whole week around it 😂",
      { like: 7, haha: 5 },
    ),
    post(
      "cp-5",
      "u-maya",
      "Maya's Closet",
      "wins",
      46,
      "First $3k month!",
      "Took me a year and a half of listing every night after work. The thing that changed it was crosslisting everything to Depop and Mercari instead of Poshmark only. Thank you all for the tips in here.",
      { yay: 31, love: 19, like: 8 },
    ),
    post("cp-6", "u-promo", "BestDeals4U", "chat", 3, "Make $500/day with my reselling course!!!", "DM me for the secret method, only 10 spots left. Link in my bio.", {}),
    post(
      "cp-7",
      "u-ivy",
      "Ivy Vintage",
      "news",
      70,
      "Heads up: eBay changed the promoted listings minimum",
      "Saw it in Seller Hub this morning. Check your campaigns before they quietly stop running.",
      { like: 6, wow: 3 },
    ),
    post(
      "cp-m0",
      "u-sam",
      "Sam Sources",
      "meetups",
      24 * 12,
      "Flea market morning",
      "Early start at the county flea market. Meet at the front gate.",
      { like: 4, love: 1 },
    ),
    post(
      "cp-8",
      "u-dre",
      "Dre Resells",
      "ideas",
      90,
      "",
      "Would love a way to share bundles of SKUs with a friend who helps me pack. My cousin packs orders for me on weekends. It would be great to send her a list of what to pull with the bin locations.",
      { like: 5 },
    ),
  ];
  const meetups: StoredMeetup[] = [
    { postId: "cp-m1", startsAt: nextDay(6, 9, now), endsAt: nextDay(6, 12, now), placeName: "Bean There Café", address: "214 Main St, Springfield" },
    { postId: "cp-m2", startsAt: nextDay(4, 18, now, 1), endsAt: nextDay(4, 21, now, 1), placeName: "Lena's place (address after you RSVP)", address: "Oak Park neighborhood", capacity: 8 },
    { postId: "cp-m0", startsAt: ago(24 * 9, now), endsAt: ago(24 * 9 - 4, now), placeName: "County Fairgrounds Flea Market", address: "1200 Fair Ave, Springfield" },
  ];
  const rsvp = (postId: string, userId: string, name: string, status: RsvpStatus, hours: number): StoredRsvp => ({ postId, userId, name, status, createdAt: ago(hours, now) });
  const rsvps: StoredRsvp[] = [
    rsvp("cp-m1", "u-ivy", "Ivy Vintage", "going", 2),
    rsvp("cp-m1", "u-maya", "Maya's Closet", "going", 1.5),
    rsvp("cp-m1", "u-sam", "Sam Sources", "going", 1.2),
    rsvp("cp-m1", "u-dre", "Dre Resells", "maybe", 1),
    rsvp("cp-m1", "u-tess", "Tess & Mike", "going", 0.8),
    rsvp("cp-m2", "u-lena", "Thrifty Lena", "going", 14),
    rsvp("cp-m2", "u-ivy", "Ivy Vintage", "going", 12),
    rsvp("cp-m2", "u-maya", "Maya's Closet", "going", 11),
    rsvp("cp-m2", "u-tess", "Tess & Mike", "going", 10),
    rsvp("cp-m2", "u-jo", "Jo's Finds", "going", 9),
    rsvp("cp-m2", "u-ray", "Ray Rewear", "going", 7),
    rsvp("cp-m2", "u-sam", "Sam Sources", "maybe", 6),
    rsvp("cp-m0", "u-sam", "Sam Sources", "going", 24 * 12),
    rsvp("cp-m0", "u-dre", "Dre Resells", "going", 24 * 11),
    rsvp("cp-m0", ME, "Your shop", "going", 24 * 11),
  ];
  const replies: StoredReply[] = [
    { id: "cr-m1", postId: "cp-m1", userId: "u-maya", authorName: "Maya's Closet", body: "I'm in! Bringing my reusable bags. Who wants to carpool from the north side?", likeCount: 3, createdAt: ago(1.5, now) },
    { id: "cr-m2", postId: "cp-m1", userId: "u-tess", authorName: "Tess & Mike", body: "Mike says he'll carry bags if there's a donut involved 🍩", likeCount: 6, createdAt: ago(0.7, now) },
    { id: "cr-m3", postId: "cp-m2", userId: "u-jo", authorName: "Jo's Finds", body: "Can I bring my own tape gun? Mine is the only one I trust lol", likeCount: 2, createdAt: ago(9, now) },
    { id: "cr-m4", postId: "cp-m0", userId: "u-dre", authorName: "Dre Resells", body: "Great morning, thanks Sam! Found two Pendleton shirts.", likeCount: 4, createdAt: ago(24 * 8.8, now) },
    { id: "cr-1", postId: "cp-2", userId: "u-lena", authorName: "Thrifty Lena", body: "Same here. I've had better luck sending offers to likers on Sunday nights.", likeCount: 4, createdAt: ago(8, now) },
    { id: "cr-2", postId: "cp-2", userId: "u-sam", authorName: "Sam Sources", body: "It's seasonal for sneakers in my experience. It picks back up before the holidays.", likeCount: 2, createdAt: ago(6, now) },
    { id: "cr-3", postId: "cp-3", userId: "u-maya", authorName: "Maya's Closet", body: "This is so helpful. Saving this.", likeCount: 1, createdAt: ago(18, now) },
    { id: "cr-4", postId: "cp-5", userId: "u-ivy", authorName: "Ivy Vintage", body: "Huge! Congrats Maya 🎉", likeCount: 3, createdAt: ago(44, now) },
    { id: "cr-5", postId: "cp-5", userId: "u-promo", authorName: "BestDeals4U", body: "Want to make 10x that? Check my bio!!", likeCount: 0, createdAt: ago(40, now) },
    { id: "cr-6", postId: "cp-1", userId: "u-dre", authorName: "Dre Resells", body: "Do you use a white backdrop or just the wall?", likeCount: 0, createdAt: ago(4, now) },
    { id: "cr-7", postId: "cp-1", userId: "u-maya", authorName: "Maya's Closet", body: "Just the wall! It's a warm white, so I set the white balance once and leave it.", likeCount: 2, createdAt: ago(3.5, now) },
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
  // Your sample reaction on Maya's big month is counted in its numbers above.
  return { posts, replies, likes: [], reactions: { "cp-5": "yay" }, reports, blocks: [], bans: [], meetups, rsvps };
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
      localStorage.removeItem("reship.community.v1");
    } catch {
      // Nothing saved.
    }
  }

  private viewMeetup = (postId: string): Meetup | undefined => {
    const s = this.load();
    const m = s.meetups.find((x) => x.postId === postId);
    if (!m) return undefined;
    const list = s.rsvps.filter((r) => r.postId === postId);
    const { postId: _id, ...rest } = m;
    return {
      ...rest,
      goingCount: list.filter((r) => r.status === "going").length,
      maybeCount: list.filter((r) => r.status === "maybe").length,
      myRsvp: list.find((r) => r.userId === ME)?.status,
    };
  };
  private viewPost = (p: StoredPost): CommunityPost => {
    const myReaction = this.load().reactions[p.id];
    return { ...p, likedByMe: !!myReaction, myReaction, mine: p.userId === ME, meetup: this.viewMeetup(p.id) };
  };
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

  repliesFor = async (postIds: string[]) => {
    const ids = new Set(postIds);
    return this.load()
      .replies.filter((r) => ids.has(r.postId))
      .map(this.viewReply);
  };

  createPost = async (p: NewPost, authorName: string) => {
    if (this.banned()) throw new Error("You can't post in the group right now.");
    const now = new Date().toISOString();
    const row: StoredPost = { id: crypto.randomUUID(), userId: ME, authorName, ...p, title: p.title.trim(), body: p.body.trim(), reactions: {}, likeCount: 0, replyCount: 0, createdAt: now, lastActivityAt: now };
    this.load().posts.unshift(row);
    this.save();
    return this.viewPost(row);
  };

  editPost = async (id: string, p: NewPost) => {
    const row = this.load().posts.find((x) => x.id === id && x.userId === ME);
    if (row) Object.assign(row, { ...p, title: p.title.trim(), body: p.body.trim() }, { editedAt: new Date().toISOString() });
    this.save();
  };

  deletePost = async (id: string) => {
    const s = this.load();
    s.posts = s.posts.filter((p) => p.id !== id);
    s.replies = s.replies.filter((r) => r.postId !== id);
    s.meetups = s.meetups.filter((m) => m.postId !== id);
    s.rsvps = s.rsvps.filter((r) => r.postId !== id);
    delete s.reactions[id];
    this.save();
  };

  reply = async (postId: string, body: string, authorName: string) => {
    if (this.banned()) throw new Error("You can't comment in the group right now.");
    const s = this.load();
    const post = s.posts.find((p) => p.id === postId);
    if (!post || post.removedAt) throw new Error("This post isn't taking comments.");
    const row: StoredReply = { id: crypto.randomUUID(), postId, userId: ME, authorName, body: body.trim(), likeCount: 0, createdAt: new Date().toISOString() };
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

  react = async (kind: ContentKind, id: string, reaction: ReactionType | null) => {
    const s = this.load();
    if (kind === "reply") {
      const key = `reply:${id}`;
      const liked = !!reaction;
      if (liked === s.likes.includes(key)) return;
      s.likes = liked ? [...s.likes, key] : s.likes.filter((k) => k !== key);
      const row = s.replies.find((r) => r.id === id);
      if (row) row.likeCount = Math.max(0, row.likeCount + (liked ? 1 : -1));
    } else {
      const row = s.posts.find((p) => p.id === id);
      const from = s.reactions[id];
      if (!row || from === (reaction ?? undefined)) return;
      row.reactions = applyReaction(row.reactions, from, reaction);
      row.likeCount = reactionTotal(row.reactions);
      if (reaction) s.reactions[id] = reaction;
      else delete s.reactions[id];
    }
    this.save();
  };

  createMeetup = async (m: NewMeetup, authorName: string) => {
    const post = await this.createPost({ category: "meetups", title: m.title, body: m.body.trim() || m.title }, authorName);
    const s = this.load();
    s.meetups.push({ postId: post.id, ...meetupFields(m) });
    // The host is going, of course.
    s.rsvps.push({ postId: post.id, userId: ME, name: authorName, status: "going", createdAt: post.createdAt });
    this.save();
    return this.viewPost(s.posts.find((p) => p.id === post.id)!);
  };

  editMeetup = async (postId: string, m: NewMeetup) => {
    await this.editPost(postId, { category: "meetups", title: m.title, body: m.body.trim() || m.title });
    const row = this.load().meetups.find((x) => x.postId === postId);
    const post = this.load().posts.find((p) => p.id === postId);
    if (row && post?.userId === ME) Object.assign(row, { endsAt: undefined, capacity: undefined }, meetupFields(m));
    this.save();
  };

  setMeetupCancelled = async (postId: string, cancelled: boolean) => {
    const row = this.load().meetups.find((x) => x.postId === postId);
    const post = this.load().posts.find((p) => p.id === postId);
    if (!row || post?.userId !== ME) return;
    if (cancelled) row.cancelledAt = new Date().toISOString();
    else delete row.cancelledAt;
    this.save();
  };

  rsvp = async (postId: string, status: RsvpStatus | null, name: string) => {
    const s = this.load();
    const meetup = this.viewMeetup(postId);
    const post = s.posts.find((p) => p.id === postId);
    if (!meetup || !post) throw new Error("This meetup isn't available.");
    if (status && (post.removedAt || meetupState(meetup) === "cancelled")) throw new Error("This meetup was cancelled.");
    if (status && meetupState(meetup) === "past") throw new Error("This meetup already happened.");
    if (status === "going" && isFull(meetup)) throw new Error("This meetup is full. You can say Maybe in case a spot opens up.");
    s.rsvps = s.rsvps.filter((r) => !(r.postId === postId && r.userId === ME));
    if (status) s.rsvps.push({ postId, userId: ME, name, status, createdAt: new Date().toISOString() });
    this.save();
  };

  attendees = async (postId: string): Promise<Attendee[]> => {
    const s = this.load();
    const blocked = new Set(s.blocks.map((b) => b.userId));
    return s.rsvps
      .filter((r) => r.postId === postId && !blocked.has(r.userId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((r) => ({ userId: r.userId, name: r.name, status: r.status, createdAt: r.createdAt, mine: r.userId === ME }));
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
  reactions: Record<string, number> | null;
  community_meetups?: MeetupRow | MeetupRow[] | null;
}
interface MeetupRow {
  post_id: string;
  starts_at: string;
  ends_at: string | null;
  place_name: string;
  address: string;
  capacity: number | null;
  cancelled_at: string | null;
  going_count: number;
  maybe_count: number;
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

  // Your reaction on each of these posts or comments.
  private async myReactions(kind: ContentKind, ids: string[]): Promise<Map<string, ReactionType>> {
    if (!ids.length) return new Map();
    const { data } = await this.db.from("community_likes").select("target_id, reaction").eq("user_id", this.userId).eq("kind", kind).in("target_id", ids);
    return new Map(((data ?? []) as { target_id: string; reaction: string | null }[]).map((r) => [r.target_id, isReaction(r.reaction) ? r.reaction : "like"]));
  }
  private async likedSet(kind: ContentKind, ids: string[]): Promise<Set<string>> {
    return new Set((await this.myReactions(kind, ids)).keys());
  }
  private async myRsvps(ids: string[]): Promise<Map<string, RsvpStatus>> {
    if (!ids.length) return new Map();
    const { data } = await this.db.from("community_rsvps").select("post_id, status").eq("user_id", this.userId).in("post_id", ids);
    return new Map(((data ?? []) as { post_id: string; status: RsvpStatus }[]).map((r) => [r.post_id, r.status]));
  }
  private async decorate(rows: PostRow[]): Promise<CommunityPost[]> {
    const meetupIds = rows.filter((r) => meetupRow(r)).map((r) => r.id);
    const [reactions, rsvps] = await Promise.all([
      this.myReactions(
        "post",
        rows.map((r) => r.id),
      ),
      this.myRsvps(meetupIds),
    ]);
    return rows.map((r) => this.toPost(r, reactions, rsvps));
  }

  private toPost = (r: PostRow, reactions: Map<string, ReactionType>, rsvps: Map<string, RsvpStatus> = new Map()): CommunityPost => ({
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
    likedByMe: reactions.has(r.id),
    myReaction: reactions.get(r.id),
    reactions: cleanCounts(r.reactions, r.like_count),
    meetup: toMeetup(meetupRow(r), rsvps.get(r.id)),
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
    const { data, error } = await this.db.from("community_posts").select(POST_SELECT).order("last_activity_at", { ascending: false }).limit(FEED_SIZE);
    if (error) throw error;
    return this.decorate(data as unknown as PostRow[]);
  }

  async getPost(id: string) {
    const [p, r] = await Promise.all([
      this.db.from("community_posts").select(POST_SELECT).eq("id", id).maybeSingle(),
      this.db.from("community_replies").select("*").eq("post_id", id).order("created_at").limit(1000),
    ]);
    if (p.error) throw p.error;
    if (r.error) throw r.error;
    const replies = (r.data ?? []) as ReplyRow[];
    const [post, likedReplies] = await Promise.all([
      p.data ? this.decorate([p.data as unknown as PostRow]).then((l) => l[0]) : Promise.resolve(null),
      this.likedSet(
        "reply",
        replies.map((x) => x.id),
      ),
    ]);
    return { post, replies: replies.map((x) => this.toReply(x, likedReplies)) };
  }

  // The newest comments across the posts on screen; the feed shows the last couple under each.
  async repliesFor(postIds: string[]) {
    if (!postIds.length) return [];
    const { data, error } = await this.db.from("community_replies").select("*").in("post_id", postIds).order("created_at", { ascending: false }).limit(400);
    if (error) throw error;
    const rows = (data ?? []) as ReplyRow[];
    const liked = await this.likedSet(
      "reply",
      rows.map((r) => r.id),
    );
    return rows.map((r) => this.toReply(r, liked));
  }

  async createPost(p: NewPost, authorName: string) {
    const { data, error } = await this.db
      .from("community_posts")
      .insert({ user_id: this.userId, author_name: authorName, category: p.category, title: p.title.trim(), body: p.body.trim() })
      .select(POST_SELECT)
      .single();
    if (error) throw friendly(error);
    return this.toPost(data as unknown as PostRow, new Map());
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

  // Upserting moves your reaction from one emoji to another; the database keeps the counts.
  async react(kind: ContentKind, id: string, reaction: ReactionType | null) {
    if (reaction) {
      const { error } = await this.db
        .from("community_likes")
        .upsert({ user_id: this.userId, kind, target_id: id, reaction: kind === "reply" ? "like" : reaction }, { onConflict: "user_id,kind,target_id" });
      if (error && error.code !== DUPLICATE) throw error;
    } else {
      const { error } = await this.db.from("community_likes").delete().eq("user_id", this.userId).eq("kind", kind).eq("target_id", id);
      if (error) throw error;
    }
  }

  // One database call makes the post and its meetup together (and RSVPs the host as going).
  async createMeetup(m: NewMeetup, authorName: string) {
    const f = meetupFields(m);
    const { data, error } = await this.db.rpc("community_create_meetup", {
      p_author_name: authorName,
      p_title: m.title.trim(),
      p_body: m.body.trim(),
      p_starts_at: f.startsAt,
      p_ends_at: f.endsAt ?? null,
      p_place_name: f.placeName,
      p_address: f.address,
      p_capacity: f.capacity ?? null,
    });
    if (error) throw friendly(error);
    const { post } = await this.getPost(data as string);
    if (!post) throw new Error("The meetup was made but didn't load. Refresh to see it.");
    return post;
  }

  async editMeetup(postId: string, m: NewMeetup) {
    await this.editPost(postId, { category: "meetups", title: m.title, body: m.body.trim() || m.title });
    const f = meetupFields(m);
    const { error } = await this.db
      .from("community_meetups")
      .update({ starts_at: f.startsAt, ends_at: f.endsAt ?? null, place_name: f.placeName, address: f.address, capacity: f.capacity ?? null })
      .eq("post_id", postId);
    if (error) throw friendly(error);
  }

  async setMeetupCancelled(postId: string, cancelled: boolean) {
    const { error } = await this.db
      .from("community_meetups")
      .update({ cancelled_at: cancelled ? new Date().toISOString() : null })
      .eq("post_id", postId);
    if (error) throw friendly(error);
  }

  async rsvp(postId: string, status: RsvpStatus | null, name: string) {
    if (status) {
      const { error } = await this.db.from("community_rsvps").upsert({ post_id: postId, user_id: this.userId, user_name: name, status }, { onConflict: "post_id,user_id" });
      if (error) throw rsvpError(error);
    } else {
      const { error } = await this.db.from("community_rsvps").delete().eq("post_id", postId).eq("user_id", this.userId);
      if (error) throw error;
    }
  }

  // Row-level security leaves out people you blocked.
  async attendees(postId: string): Promise<Attendee[]> {
    const { data, error } = await this.db.from("community_rsvps").select("user_id, user_name, status, created_at").eq("post_id", postId).order("created_at").limit(1000);
    if (error) throw error;
    return ((data ?? []) as { user_id: string; user_name: string; status: RsvpStatus; created_at: string }[]).map((r) => ({
      userId: r.user_id,
      name: r.user_name,
      status: r.status,
      createdAt: r.created_at,
      mine: r.user_id === this.userId,
    }));
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

const POST_SELECT = "*, community_meetups(*)";

// PostgREST returns a one-to-one embed as an object, but older versions send a one-item list.
const meetupRow = (r: PostRow): MeetupRow | null => (Array.isArray(r.community_meetups) ? (r.community_meetups[0] ?? null) : (r.community_meetups ?? null));

function toMeetup(m: MeetupRow | null, myRsvp?: RsvpStatus): Meetup | undefined {
  if (!m) return undefined;
  return {
    startsAt: m.starts_at,
    endsAt: m.ends_at ?? undefined,
    placeName: m.place_name,
    address: m.address,
    capacity: m.capacity ?? undefined,
    cancelledAt: m.cancelled_at ?? undefined,
    goingCount: m.going_count,
    maybeCount: m.maybe_count,
    myRsvp,
  };
}

// Only known emoji with a positive count; posts from before reactions count their likes as 👍.
function cleanCounts(raw: Record<string, number> | null, likeCount: number): ReactionCounts {
  const out: ReactionCounts = {};
  for (const [k, v] of Object.entries(raw ?? {})) if (isReaction(k) && v > 0) out[k] = v;
  if (!reactionTotal(out) && likeCount > 0) out.like = likeCount;
  return out;
}

// The database's RSVP checks raise plain sentences; pass them through.
function rsvpError(error: { message: string; code?: string }): Error {
  if (/full|cancelled|already happened/i.test(error.message)) return new Error(error.message);
  return friendly(error);
}

// Row-level security refusals read as database jargon; a refused post or reply almost always means
// a ban or a post that was taken down.
function friendly(error: { message: string; code?: string }): Error {
  if (error.code === "42501" || /row-level security/i.test(error.message)) return new Error("You can't post or comment in the group right now.");
  return new Error(error.message);
}
