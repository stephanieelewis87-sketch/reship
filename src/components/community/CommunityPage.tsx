import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, CalendarPlus, Search, ShieldCheck, Users } from "lucide-react";
import type { useReshipData } from "@/lib/useReshipData";
import {
  type Attendee,
  type BlockedSeller,
  type CommunityCategory,
  type CommunityMe,
  type CommunityPost,
  type CommunityReply,
  type CommunitySort,
  POST_TOPICS,
  type ReportedItem,
  applyReaction,
  applyRsvp,
  authorNameFrom,
  filterPosts,
  reactionTotal,
  sortPosts,
  splitMeetups,
  visibleReplies,
} from "@/lib/community";
import type { Route } from "../shell/route";
import { go } from "../shell/route";
import { EmptyState, inputClass, selectClass } from "../ui";
import { ComposerBar, PostCard, PostComposer } from "./feed";
import { type MeetupPost, MeetupDetails, MeetupForm, MeetupsTab, UpcomingMeetups } from "./meetups";
import { BanModal, BlockedList, Confirm, ReportModal, ReportQueue } from "./moderation";
import { AvatarStack, Banner, type PostActions, type Target } from "./parts";

type Data = ReturnType<typeof useReshipData>;
type Tab = "feed" | "meetups" | "reports" | "blocked";
type Filter = CommunityCategory | "all" | "mine";

// How many posts get their latest comments loaded with the feed.
const PREVIEW_POSTS = 40;

// The Hubby group: a feed where resellers post, comment and react, plus meetups they plan together.
export function CommunityPage({ data, route }: { data: Data; route: Route }) {
  const api = data.store.community;
  const postId = route.params.get("post");
  const tabParam = route.params.get("tab");
  const [me, setMe] = useState<CommunityMe | null>(null);
  const [posts, setPosts] = useState<CommunityPost[] | null>(null);
  const [comments, setComments] = useState<Record<string, CommunityReply[]>>({});
  const [blocked, setBlocked] = useState<BlockedSeller[]>([]);
  const [queue, setQueue] = useState<ReportedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [composer, setComposer] = useState<{ edit?: CommunityPost } | null>(null);
  const [planner, setPlanner] = useState<{ edit?: MeetupPost } | null>(null);
  const [reporting, setReporting] = useState<Target | null>(null);
  const [blocking, setBlocking] = useState<Target | null>(null);
  const [banning, setBanning] = useState<Target | null>(null);
  const [deleting, setDeleting] = useState<{ kind: "post" | "reply"; id: string; meetup: boolean } | null>(null);
  // Bumped after anything that could change the open post's page.
  const [version, setVersion] = useState(0);

  const authorName = authorNameFrom(data.settings.displayName);
  const blockedIds = useMemo(() => new Set(blocked.map((b) => b.userId)), [blocked]);
  const tab: Tab = tabParam === "reports" && me?.isAdmin ? "reports" : tabParam === "blocked" ? "blocked" : tabParam === "meetups" ? "meetups" : "feed";

  const refresh = useCallback(async () => {
    try {
      const [m, list, b] = await Promise.all([api.me(), api.listPosts(), api.blocked()]);
      const recent = [...list].sort((x, y) => y.lastActivityAt.localeCompare(x.lastActivityAt)).slice(0, PREVIEW_POSTS);
      const replies = await api.repliesFor(recent.filter((p) => p.replyCount > 0).map((p) => p.id)).catch(() => []);
      const byPost: Record<string, CommunityReply[]> = {};
      for (const r of replies) (byPost[r.postId] ??= []).push(r);
      setMe(m);
      setPosts(list);
      setComments(byPost);
      setBlocked(b);
      setQueue(m.isAdmin ? await api.admin.queue() : []);
      setError(null);
    } catch (e) {
      setPosts((p) => p ?? []);
      setError(e instanceof Error ? e.message : "The group didn't load.");
    }
    setVersion((v) => v + 1);
  }, [api]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const flash = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((n) => (n === text ? null : n)), 3500);
  };
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn();
      if (done) flash(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    }
    await refresh();
  };
  // Show a change right away, then let the server's answer replace it.
  const patchPost = (id: string, fn: (p: CommunityPost) => CommunityPost) => setPosts((list) => list && list.map((p) => (p.id === id ? fn(p) : p)));
  const patchReply = (id: string, fn: (r: CommunityReply) => CommunityReply) =>
    setComments((all) => Object.fromEntries(Object.entries(all).map(([k, l]) => [k, l.map((r) => (r.id === id ? fn(r) : r))])));

  const actions: PostActions = {
    me,
    authorName,
    onReact: (kind, id, reaction) => {
      if (kind === "post")
        patchPost(id, (p) => {
          const reactions = applyReaction(p.reactions, p.myReaction, reaction);
          return { ...p, reactions, likeCount: reactionTotal(reactions), myReaction: reaction ?? undefined, likedByMe: !!reaction };
        });
      else patchReply(id, (r) => ({ ...r, likedByMe: !!reaction, likeCount: Math.max(0, r.likeCount + (reaction ? 1 : -1)) }));
      run(() => api.react(kind, id, reaction));
    },
    onComment: async (pid, body) => {
      await api.reply(pid, body, authorName);
      await refresh();
    },
    onRsvp: (post, status) => {
      if (post.meetup) patchPost(post.id, (p) => ({ ...p, meetup: applyRsvp(p.meetup!, status) }));
      run(
        () => api.rsvp(post.id, status, authorName),
        status === "going" ? "You're going! It's on your list under Meetups." : status === "maybe" ? "Marked as maybe." : "Got it, you can't make it.",
      );
    },
    onReport: setReporting,
    onBlock: setBlocking,
    onBan: setBanning,
    onModerate: (kind, id, action) =>
      run(() => api.admin.moderate(kind, id, action), action === "remove" ? "Removed. Only you and the author can still see it." : "Back up for everyone."),
    onDelete: (kind, id) => setDeleting({ kind, id, meetup: !!posts?.find((p) => p.id === id)?.meetup }),
    onEdit: (post) => (post.meetup ? setPlanner({ edit: post as MeetupPost }) : setComposer({ edit: post })),
    onCancelMeetup: (post, cancelled) =>
      run(() => api.setMeetupCancelled(post.id, cancelled), cancelled ? "Meetup cancelled. Everyone who RSVP'd sees it on the post." : "The meetup is back on."),
  };

  const visible = useMemo(() => (posts ? filterPosts(posts, { blocked: blockedIds, showRemoved: me?.isAdmin }) : []), [posts, blockedIds, me?.isAdmin]);
  const meetups = useMemo(() => splitMeetups(visible), [visible]);
  const allMeetups = useMemo(() => visible.filter((p): p is MeetupPost => !!p.meetup), [visible]);
  const canPost = !!me && !me.banned;

  const tabs: { key: Tab; label: string }[] = [
    { key: "feed", label: "Discussion" },
    { key: "meetups", label: meetups.upcoming.length ? `Meetups (${meetups.upcoming.length})` : "Meetups" },
  ];
  if (me?.isAdmin) tabs.push({ key: "reports", label: queue.length ? `Reports (${queue.length})` : "Reports" });
  tabs.push({ key: "blocked", label: "Blocked" });

  return (
    <div>
      <GroupHeader slim={!!postId} posts={visible} upcoming={meetups.upcoming.length} canPost={canPost} onPost={() => setComposer({})} onPlan={() => setPlanner({})} />
      <div className="px-4 md:px-8 border-b border-border flex gap-5 overflow-x-auto bg-card/60">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => go("community", t.key === "feed" ? undefined : { tab: t.key })}
            aria-current={tab === t.key && !postId ? "page" : undefined}
            className={`py-3 text-sm whitespace-nowrap border-b-[3px] -mb-px ${tab === t.key && !postId ? "border-accent text-accent font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 md:px-8 py-5">
        <div className="max-w-5xl mx-auto lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6 items-start">
          <div className="space-y-4 min-w-0 max-w-2xl w-full mx-auto lg:mx-0">
            {me?.banned && <Banner tone="warn">A moderator has paused your posting in the group. You can still read along. Questions? Send them through Feedback.</Banner>}
            {error && (
              <Banner tone="error" onClose={() => setError(null)}>
                {error}
              </Banner>
            )}
            {notice && <Banner tone="ok">{notice}</Banner>}

            {posts === null ? (
              <p className="text-sm text-muted-foreground text-center py-16">Loading…</p>
            ) : postId ? (
              <PostPage key={postId} postId={postId} data={data} version={version} blocked={blockedIds} actions={actions} />
            ) : tab === "reports" ? (
              <ReportQueue queue={queue} actions={actions} />
            ) : tab === "blocked" ? (
              <BlockedList
                blocked={blocked}
                me={me}
                onUnblock={(b) => run(() => api.unblock(b.userId), `Unblocked ${b.name}.`)}
                loadBans={api.admin.bans}
                onUnban={(b) => run(() => api.admin.unban(b.userId), `${b.name} can post again.`)}
              />
            ) : tab === "meetups" ? (
              <MeetupsTab posts={allMeetups} actions={actions} onPlan={() => setPlanner({})} />
            ) : (
              <Feed
                posts={visible}
                upcoming={meetups.upcoming}
                comments={comments}
                blocked={blockedIds}
                actions={actions}
                canPost={canPost}
                onNew={() => setComposer({})}
                onPlan={() => setPlanner({})}
              />
            )}
          </div>
          <aside className="hidden lg:block space-y-4 sticky top-4">
            <UpcomingMeetups posts={meetups.upcoming} onPlan={canPost ? () => setPlanner({}) : undefined} />
            <AboutGroup />
          </aside>
        </div>
      </div>

      {composer && (
        <PostComposer
          edit={composer.edit}
          authorName={authorName}
          onClose={() => setComposer(null)}
          onMeetup={() => {
            setComposer(null);
            setPlanner({});
          }}
          onSave={async (p) => {
            if (composer.edit) {
              await api.editPost(composer.edit.id, p);
              flash("Saved.");
            } else {
              await api.createPost(p, authorName);
              flash("Posted to the group.");
              go("community");
            }
            setComposer(null);
            await refresh();
          }}
        />
      )}
      {planner && (
        <MeetupForm
          edit={planner.edit}
          authorName={authorName}
          onClose={() => setPlanner(null)}
          onSave={async (m) => {
            if (planner.edit) {
              await api.editMeetup(planner.edit.id, m);
              flash("Meetup updated.");
            } else {
              const created = await api.createMeetup(m, authorName);
              flash("Your meetup is posted, and you're down as going.");
              go("community", { post: created.id });
            }
            setPlanner(null);
            await refresh();
          }}
        />
      )}
      {reporting && (
        <ReportModal
          target={reporting}
          onClose={() => setReporting(null)}
          onSend={async (reason, note) => {
            await api.report(reporting.kind, reporting.id, reason, note);
            setReporting(null);
            flash("Thanks. A moderator will take a look.");
            await refresh();
          }}
        />
      )}
      {blocking && (
        <Confirm
          title={`Block ${blocking.authorName}?`}
          text="You won't see their posts, comments or RSVPs anymore, and they won't know. You can unblock them any time from the Blocked tab."
          confirm="Block"
          onClose={() => setBlocking(null)}
          onConfirm={() => {
            const t = blocking;
            setBlocking(null);
            if (postId && t.kind === "post") go("community");
            return run(() => api.block(t.userId, t.authorName), `Blocked ${t.authorName}.`);
          }}
        />
      )}
      {deleting && (
        <Confirm
          title={deleting.kind === "reply" ? "Delete this comment?" : deleting.meetup ? "Delete this meetup?" : "Delete this post?"}
          text={
            deleting.kind === "reply"
              ? "It's gone for everyone."
              : deleting.meetup
                ? "The meetup, its RSVPs and its discussion are gone for everyone. If you just can't host anymore, Cancel meetup keeps the post up so people know."
                : "The post and its comments are gone for everyone."
          }
          confirm="Delete"
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            const d = deleting;
            setDeleting(null);
            return run(async () => {
              if (d.kind === "post") {
                await api.deletePost(d.id);
                if (postId) go("community", d.meetup ? { tab: "meetups" } : undefined);
              } else await api.deleteReply(d.id);
            }, "Deleted.");
          }}
        />
      )}
      {banning && (
        <BanModal
          target={banning}
          onClose={() => setBanning(null)}
          onBan={(reason) => {
            const t = banning;
            setBanning(null);
            return run(() => api.admin.ban(t.userId, t.authorName, reason), `${t.authorName} can no longer post or comment.`);
          }}
        />
      )}
    </div>
  );
}

// ---------- The group's cover ----------

function GroupHeader({ slim, posts, upcoming, canPost, onPost, onPlan }: { slim: boolean; posts: CommunityPost[]; upcoming: number; canPost: boolean; onPost: () => void; onPlan: () => void }) {
  // The faces of people who posted or commented lately.
  const recent = useMemo(() => {
    const names: string[] = [];
    for (const p of [...posts].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))) if (!names.includes(p.authorName)) names.push(p.authorName);
    return names;
  }, [posts]);
  return (
    // On a phone, a post's own page skips the cover so the post is on screen right away.
    <div className={`border-b border-border bg-card ${slim ? "hidden md:block" : ""}`}>
      <div className="h-28 md:h-40 relative overflow-hidden bg-[image:var(--metal)]">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1.2px, transparent 0)", backgroundSize: "18px 18px" }} />
        <svg className="absolute -right-6 -bottom-10 w-72 h-72 text-white/15" viewBox="0 0 200 200" aria-hidden>
          <circle cx="100" cy="100" r="34" fill="currentColor" />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <g key={a} transform={`rotate(${a} 100 100)`}>
              <rect x="97" y="22" width="6" height="44" rx="3" fill="currentColor" />
              <circle cx="100" cy="18" r="12" fill="currentColor" />
            </g>
          ))}
        </svg>
      </div>
      <div className="px-4 md:px-8 pb-4 max-w-5xl mx-auto">
        <div className="flex items-end gap-4 -mt-8 md:-mt-10 flex-wrap">
          <span className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-card ring-4 ring-card shadow-md flex items-center justify-center shrink-0">
            <Users className="w-8 h-8 md:w-10 md:h-10 text-accent" />
          </span>
          <div className="min-w-0 flex-1 pt-10 md:pt-12">
            <h1 className="font-serif text-2xl md:text-[30px] font-medium tracking-tight text-foreground leading-tight">The Hubby Hangout</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Your reselling hub, plus the hubbies, partners and pals who carry the bags</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          {recent.length > 0 && <AvatarStack names={recent} max={7} />}
          <span className="text-xs text-muted-foreground">
            {recent.length} {recent.length === 1 ? "member" : "members"} active lately
            {upcoming > 0 && (
              <>
                {" · "}
                <a href="#/community?tab=meetups" className="text-accent font-medium hover:underline">
                  {upcoming} upcoming {upcoming === 1 ? "meetup" : "meetups"}
                </a>
              </>
            )}
          </span>
          <span className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={onPlan}
              disabled={!canPost}
              className="px-3 py-2 rounded-lg bg-muted text-foreground text-sm font-semibold hover:bg-muted/70 flex items-center gap-1.5 disabled:opacity-50"
            >
              <CalendarPlus className="w-4 h-4" /> <span className="sm:hidden">Meetup</span>
              <span className="hidden sm:inline">Plan a meetup</span>
            </button>
            <button
              type="button"
              onClick={onPost}
              disabled={!canPost}
              className="px-3 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent-hover flex items-center gap-1.5 disabled:opacity-50"
            >
              + Post
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

function AboutGroup() {
  return (
    <section className="rounded-xl border border-border bg-card shadow-[var(--card-shadow)] p-4 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">About this group</h2>
      <p className="text-xs text-muted-foreground leading-relaxed">
        A friendly hub for resellers to swap tips, celebrate wins, ask anything and meet up in person. Partners and helpers are always welcome.
      </p>
      <div>
        <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-accent" /> Group rules
        </h3>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
          <li>Be kind. We're all figuring it out.</li>
          <li>Keep it about reselling and the people who make it work.</li>
          <li>No selling courses, spam or DM-me schemes.</li>
          <li>Meet in public places first, and look out for each other.</li>
        </ol>
      </div>
      <p className="text-[11px] text-muted-foreground">Report anything that crosses the line and a moderator will look at it.</p>
    </section>
  );
}

// ---------- Feed ----------

function Feed({
  posts,
  upcoming,
  comments,
  blocked,
  actions,
  canPost,
  onNew,
  onPlan,
}: {
  posts: CommunityPost[];
  upcoming: MeetupPost[];
  comments: Record<string, CommunityReply[]>;
  blocked: Set<string>;
  actions: PostActions;
  canPost: boolean;
  onNew: () => void;
  onPlan: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<CommunitySort>("active");
  const [search, setSearch] = useState("");
  const isAdmin = !!actions.me?.isAdmin;
  const shown = useMemo(() => sortPosts(filterPosts(posts, { category: filter, search, showRemoved: isAdmin }), sort), [posts, filter, search, isAdmin, sort]);
  const chips: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "meetups", label: "Meetups" },
    ...POST_TOPICS.map((c) => ({ id: c.id, label: c.label })),
    { id: "mine", label: "My posts" },
  ];

  return (
    <>
      <ComposerBar name={actions.authorName} disabled={!canPost} onPost={onNew} onMeetup={onPlan} />
      <UpcomingMeetups posts={upcoming} compact />
      <div className="flex gap-2 items-center flex-wrap">
        <label className="relative flex-1 min-w-48">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className={`${inputClass} pl-8 !rounded-full`} placeholder="Search this group" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search this group" />
        </label>
        <select className={selectClass} value={sort} onChange={(e) => setSort(e.target.value as CommunitySort)} aria-label="Sort posts">
          <option value="active">Most recent activity</option>
          <option value="new">New posts</option>
          <option value="top">Top posts</option>
        </select>
      </div>
      <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-1" role="tablist" aria-label="Topics">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={filter === c.id}
            onClick={() => setFilter(c.id)}
            className={`px-3 py-1 rounded-full text-xs whitespace-nowrap ${filter === c.id ? "bg-accent text-accent-foreground font-semibold" : "bg-muted text-muted-foreground hover:text-foreground"}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <EmptyState
          icon={filter === "meetups" ? CalendarDays : Users}
          title={search || filter !== "all" ? "Nothing matches" : "No posts yet"}
          text={search || filter !== "all" ? "Try another topic or search." : "Say hi! Start the conversation with a tip, a win or a question."}
          action={canPost ? { label: filter === "meetups" ? "Plan a meetup" : "Write a post", onClick: filter === "meetups" ? onPlan : onNew } : undefined}
        />
      ) : (
        <ul className="space-y-4">
          {shown.map((p) => (
            <li key={p.id}>
              <PostCard post={p} comments={visibleReplies(comments[p.id] ?? [], blocked, isAdmin)} actions={actions} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ---------- One post (or meetup) on its own page ----------

function PostPage({ postId, data, version, blocked, actions }: { postId: string; data: Data; version: number; blocked: Set<string>; actions: PostActions }) {
  const api = data.store.community;
  const [post, setPost] = useState<CommunityPost | null | undefined>(undefined);
  const [replies, setReplies] = useState<CommunityReply[]>([]);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const isAdmin = !!actions.me?.isAdmin;

  const load = useCallback(async () => {
    try {
      const r = await api.getPost(postId);
      setPost(r.post);
      setReplies(r.replies);
      setAttendees(r.post?.meetup ? await api.attendees(postId) : []);
    } catch {
      setPost(null);
    }
  }, [api, postId]);
  useEffect(() => {
    load();
  }, [load, version]);

  // Reactions show instantly here too; the page reloads when the server answers.
  const local: PostActions = useMemo(
    () => ({
      ...actions,
      onReact: (kind, id, reaction) => {
        if (kind === "post")
          setPost((p) => {
            if (!p) return p;
            const reactions = applyReaction(p.reactions, p.myReaction, reaction);
            return { ...p, reactions, likeCount: reactionTotal(reactions), myReaction: reaction ?? undefined, likedByMe: !!reaction };
          });
        else setReplies((l) => l.map((r) => (r.id === id ? { ...r, likedByMe: !!reaction, likeCount: Math.max(0, r.likeCount + (reaction ? 1 : -1)) } : r)));
        actions.onReact(kind, id, reaction);
      },
      onRsvp: (p, status) => {
        setPost((cur) => (cur?.meetup ? { ...cur, meetup: applyRsvp(cur.meetup, status) } : cur));
        actions.onRsvp(p, status);
      },
    }),
    [actions],
  );

  const back = (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? window.history.back() : go("community"))}
      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="w-4 h-4" /> Back to the group
    </button>
  );
  if (post === undefined) return <p className="text-sm text-muted-foreground text-center py-16">Loading…</p>;
  if (!post || (blocked.has(post.userId) && !post.mine))
    return (
      <>
        {back}
        <EmptyState icon={Users} title="This post isn't available" text="It may have been deleted or removed, or it's from someone you blocked." />
      </>
    );

  return (
    <>
      {back}
      {post.meetup && <MeetupDetails post={post as MeetupPost} attendees={attendees} actions={local} />}
      {post.meetup && <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-1">Discussion</h2>}
      <PostCard post={post} comments={visibleReplies(replies, blocked, isAdmin)} actions={local} expanded />
    </>
  );
}
