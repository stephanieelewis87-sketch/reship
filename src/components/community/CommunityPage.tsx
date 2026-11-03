import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Ban,
  Check,
  EyeOff,
  Flag,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserX,
  Users,
} from "lucide-react";
import type { useReshipData } from "@/lib/useReshipData";
import {
  type BannedSeller,
  type BlockedSeller,
  CATEGORIES,
  type CommunityCategory,
  type CommunityMe,
  type CommunityPost,
  type CommunityReply,
  type CommunitySort,
  type ContentKind,
  LIMITS,
  type NewPost,
  REPORT_REASONS,
  type ReportReason,
  type ReportedItem,
  authorNameFrom,
  categoryLabel,
  excerpt,
  filterPosts,
  postProblem,
  reasonLabel,
  replyProblem,
  sortPosts,
  timeAgo,
  visibleReplies,
} from "@/lib/community";
import type { Route } from "../shell/route";
import { go } from "../shell/route";
import { PageHeader } from "../shell/PageHeader";
import { EmptyState, Field, Menu, MenuItem, Modal, ModalHeader, inputClass, primaryButton, secondaryButton, selectClass } from "../ui";

type Data = ReturnType<typeof useReshipData>;
type Tab = "feed" | "reports" | "blocked";
type Filter = CommunityCategory | "all" | "mine";

// Someone to block, report or ban, from a post or reply's menu.
interface Target {
  kind: ContentKind;
  id: string;
  userId: string;
  authorName: string;
}

export function CommunityPage({ data, route }: { data: Data; route: Route }) {
  const api = data.store.community;
  const postId = route.params.get("post");
  const tabParam = route.params.get("tab");
  const [me, setMe] = useState<CommunityMe | null>(null);
  const [posts, setPosts] = useState<CommunityPost[] | null>(null);
  const [blocked, setBlocked] = useState<BlockedSeller[]>([]);
  const [queue, setQueue] = useState<ReportedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [composer, setComposer] = useState<{ edit?: CommunityPost } | null>(null);
  const [reporting, setReporting] = useState<Target | null>(null);
  const [blocking, setBlocking] = useState<Target | null>(null);
  const [banning, setBanning] = useState<Target | null>(null);

  const authorName = authorNameFrom(data.settings.displayName);
  const blockedIds = useMemo(() => new Set(blocked.map((b) => b.userId)), [blocked]);
  const tab: Tab = tabParam === "reports" && me?.isAdmin ? "reports" : tabParam === "blocked" ? "blocked" : "feed";

  const refresh = useCallback(async () => {
    try {
      const [m, list, b] = await Promise.all([api.me(), api.listPosts(), api.blocked()]);
      setMe(m);
      setPosts(list);
      setBlocked(b);
      setQueue(m.isAdmin ? await api.admin.queue() : []);
      setError(null);
    } catch (e) {
      setPosts((p) => p ?? []);
      setError(e instanceof Error ? e.message : "The Community didn't load.");
    }
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

  const actions: PostActions = {
    me,
    authorName,
    onLike: (kind, id, liked) => run(() => api.setLiked(kind, id, liked)),
    onReport: setReporting,
    onBlock: setBlocking,
    onBan: setBanning,
    onModerate: (kind, id, action) =>
      run(() => api.admin.moderate(kind, id, action), action === "remove" ? "Removed. Only you and the author can still see it." : "Back up for everyone."),
    onDelete: (kind, id) =>
      run(async () => {
        if (kind === "post") {
          await api.deletePost(id);
          go("community");
        } else await api.deleteReply(id);
      }, "Deleted."),
    onEdit: (post) => setComposer({ edit: post }),
  };

  const tabs: { key: Tab; label: string }[] = [{ key: "feed", label: "Discussions" }];
  if (me?.isAdmin) tabs.push({ key: "reports", label: queue.length ? `Reports (${queue.length})` : "Reports" });
  tabs.push({ key: "blocked", label: "Blocked" });

  return (
    <div>
      <PageHeader title="Community" subtitle="Swap tips, ask questions and share wins with other resellers">
        {tab === "feed" && !postId && (
          <button type="button" className={primaryButton} onClick={() => setComposer({})} disabled={!me || me.banned}>
            <Plus className="w-4 h-4" /> New post
          </button>
        )}
      </PageHeader>
      <div className="px-4 md:px-8 border-b border-border flex gap-5 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => go("community", t.key === "feed" ? undefined : { tab: t.key })}
            aria-current={tab === t.key ? "page" : undefined}
            className={`py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t.key ? "border-accent text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 md:px-8 py-5 max-w-3xl space-y-4">
        {me?.banned && (
          <Banner tone="warn">A moderator has paused your posting in the Community. You can still read along. Questions? Send them through Feedback.</Banner>
        )}
        {error && (
          <Banner tone="error" onClose={() => setError(null)}>
            {error}
          </Banner>
        )}
        {notice && <Banner tone="ok">{notice}</Banner>}

        {posts === null ? (
          <p className="text-sm text-muted-foreground text-center py-16">Loading…</p>
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
        ) : postId ? (
          <PostView key={postId} postId={postId} data={data} blocked={blockedIds} actions={actions} onChanged={refresh} />
        ) : (
          <Feed posts={posts} me={me} blocked={blockedIds} actions={actions} onNew={() => setComposer({})} />
        )}
      </div>

      {composer && (
        <Composer
          edit={composer.edit}
          authorName={authorName}
          onClose={() => setComposer(null)}
          onSave={async (p) => {
            if (composer.edit) {
              await api.editPost(composer.edit.id, p);
              flash("Saved.");
            } else {
              const created = await api.createPost(p, authorName);
              go("community", { post: created.id });
            }
            setComposer(null);
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
          text="You won't see their posts or replies anymore, and they won't know. You can unblock them any time from the Blocked tab."
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
      {banning && (
        <BanModal
          target={banning}
          onClose={() => setBanning(null)}
          onBan={(reason) => {
            const t = banning;
            setBanning(null);
            return run(() => api.admin.ban(t.userId, t.authorName, reason), `${t.authorName} can no longer post or reply.`);
          }}
        />
      )}
    </div>
  );
}

interface PostActions {
  me: CommunityMe | null;
  authorName: string;
  onLike: (kind: ContentKind, id: string, liked: boolean) => void;
  onReport: (t: Target) => void;
  onBlock: (t: Target) => void;
  onBan: (t: Target) => void;
  onModerate: (kind: ContentKind, id: string, action: "remove" | "restore" | "dismiss") => void;
  onDelete: (kind: ContentKind, id: string) => void;
  onEdit: (p: CommunityPost) => void;
}

// ---------- Feed ----------

function Feed({ posts, me, blocked, actions, onNew }: { posts: CommunityPost[]; me: CommunityMe | null; blocked: Set<string>; actions: PostActions; onNew: () => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<CommunitySort>("active");
  const [search, setSearch] = useState("");
  const shown = useMemo(
    () => sortPosts(filterPosts(posts, { category: filter, search, blocked, showRemoved: me?.isAdmin }), sort),
    [posts, filter, search, blocked, me?.isAdmin, sort],
  );
  const chips: { id: Filter; label: string }[] = [{ id: "all", label: "All" }, ...CATEGORIES.map((c) => ({ id: c.id, label: c.label })), { id: "mine", label: "My posts" }];

  return (
    <>
      <p className="text-xs text-muted-foreground rounded-lg bg-muted/60 px-3 py-2">
        Be kind, keep it about reselling, and no selling courses or spam. Report anything that crosses the line and a moderator will look at it.
      </p>
      <div className="flex gap-2 items-center flex-wrap">
        <label className="relative flex-1 min-w-48">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className={`${inputClass} pl-8`} placeholder="Search posts" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search posts" />
        </label>
        <select className={selectClass} value={sort} onChange={(e) => setSort(e.target.value as CommunitySort)} aria-label="Sort posts">
          <option value="active">Recently active</option>
          <option value="new">Newest</option>
          <option value="top">Top</option>
        </select>
      </div>
      <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-1" role="tablist" aria-label="Categories">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={filter === c.id}
            onClick={() => setFilter(c.id)}
            className={`px-3 py-1 rounded-full border text-xs whitespace-nowrap ${filter === c.id ? "border-accent bg-accent/15 text-accent font-medium" : "border-border text-muted-foreground hover:bg-muted"}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search || filter !== "all" ? "No posts match" : "No posts yet"}
          text={search || filter !== "all" ? "Try another category or search." : "Start the conversation with a tip or a question."}
          action={me && !me.banned ? { label: "Write a post", onClick: onNew } : undefined}
        />
      ) : (
        <ul className="space-y-2.5">
          {shown.map((p) => (
            <li key={p.id}>
              <PostCard post={p} actions={actions} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function PostCard({ post, actions }: { post: CommunityPost; actions: PostActions }) {
  const open = () => go("community", { post: post.id });
  return (
    <article
      className={`rounded-xl border bg-card p-4 cursor-pointer hover:border-accent/40 transition-colors ${post.removedAt ? "border-dashed border-destructive/40 opacity-75" : "border-border"}`}
      onClick={open}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Byline name={post.authorName} at={post.createdAt} category={post.category} mine={post.mine} />
          <h2 className="mt-1.5 font-display text-[15px] font-semibold text-foreground leading-snug">
            <a
              href={`#/community?post=${post.id}`}
              onClick={(e) => e.stopPropagation()}
              className="hover:underline focus:underline outline-none"
            >
              {post.title}
            </a>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{excerpt(post.body)}</p>
          {post.removedAt && <Hidden reason={post.removedReason} />}
        </div>
        <ItemMenu kind="post" item={post} actions={actions} />
      </div>
      <div className="mt-3 flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
        <LikeButton liked={post.likedByMe} count={post.likeCount} onClick={() => actions.onLike("post", post.id, !post.likedByMe)} />
        <button type="button" onClick={open} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <MessageCircle className="w-3.5 h-3.5" /> {post.replyCount} {post.replyCount === 1 ? "reply" : "replies"}
        </button>
      </div>
    </article>
  );
}

// ---------- One post and its replies ----------

function PostView({ postId, data, blocked, actions, onChanged }: { postId: string; data: Data; blocked: Set<string>; actions: PostActions; onChanged: () => Promise<void> }) {
  const api = data.store.community;
  const [post, setPost] = useState<CommunityPost | null | undefined>(undefined);
  const [replies, setReplies] = useState<CommunityReply[]>([]);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const isAdmin = !!actions.me?.isAdmin;

  const load = useCallback(async () => {
    try {
      const r = await api.getPost(postId);
      setPost(r.post);
      setReplies(r.replies);
    } catch {
      setPost(null);
    }
  }, [api, postId]);
  useEffect(() => {
    load();
  }, [load]);

  // Every action on this screen refreshes both the post and the feed behind it.
  const wrapped: PostActions = useMemo(() => {
    const after =
      <A extends unknown[]>(fn: (...a: A) => unknown) =>
      async (...a: A) => {
        await fn(...a);
        await load();
      };
    return { ...actions, onLike: after(actions.onLike), onModerate: after(actions.onModerate), onDelete: after(actions.onDelete) };
  }, [actions, load]);

  if (post === undefined) return <p className="text-sm text-muted-foreground text-center py-16">Loading…</p>;
  const back = (
    <button type="button" onClick={() => go("community")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="w-4 h-4" /> All discussions
    </button>
  );
  if (!post || (blocked.has(post.userId) && !post.mine))
    return (
      <>
        {back}
        <EmptyState icon={Users} title="This post isn't available" text="It may have been deleted or removed, or it's from someone you blocked." />
      </>
    );

  const shown = visibleReplies(replies, blocked, isAdmin);
  const canReply = !!actions.me && !actions.me.banned && !post.removedAt;
  const send = async () => {
    const p = replyProblem(draft);
    if (p) return setProblem(p);
    setSending(true);
    try {
      await api.reply(post.id, draft, actions.authorName);
      setDraft("");
      setProblem(null);
      await Promise.all([load(), onChanged()]);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Your reply didn't send.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {back}
      <article className={`rounded-xl border bg-card p-4 md:p-5 ${post.removedAt ? "border-dashed border-destructive/40" : "border-border"}`}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <Byline name={post.authorName} at={post.createdAt} category={post.category} mine={post.mine} edited={!!post.editedAt} />
            <h2 className="mt-2 font-serif text-xl font-medium text-foreground leading-snug">{post.title}</h2>
          </div>
          <ItemMenu kind="post" item={post} actions={wrapped} />
        </div>
        <p className="mt-3 text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">{post.body}</p>
        {post.removedAt && <Hidden reason={post.removedReason} />}
        <div className="mt-4">
          <LikeButton liked={post.likedByMe} count={post.likeCount} onClick={() => wrapped.onLike("post", post.id, !post.likedByMe)} />
        </div>
      </article>

      <section aria-label="Replies" className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-2">
          {shown.length} {shown.length === 1 ? "reply" : "replies"}
        </h3>
        {shown.map((r) => (
          <div key={r.id} className={`rounded-lg border bg-card px-4 py-3 ${r.removedAt ? "border-dashed border-destructive/40 opacity-80" : "border-border"}`}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <Byline name={r.authorName} at={r.createdAt} mine={r.mine} />
                <p className="mt-1.5 text-sm text-foreground whitespace-pre-wrap break-words">{r.body}</p>
                {r.removedAt && <Hidden reason={r.removedReason} />}
              </div>
              <ItemMenu kind="reply" item={r} actions={wrapped} />
            </div>
            <div className="mt-2">
              <LikeButton small liked={r.likedByMe} count={r.likeCount} onClick={() => wrapped.onLike("reply", r.id, !r.likedByMe)} />
            </div>
          </div>
        ))}
      </section>

      {canReply ? (
        <form
          className="rounded-xl border border-border bg-card p-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            className={`${inputClass} min-h-20`}
            placeholder="Add a reply"
            aria-label="Your reply"
            maxLength={LIMITS.reply}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setProblem(null);
            }}
          />
          <div className="flex items-center justify-between gap-3">
            <p className={`text-xs ${problem ? "text-destructive" : "text-muted-foreground"}`}>{problem ?? `Replying as ${actions.authorName}`}</p>
            <button type="submit" className={primaryButton} disabled={sending || !draft.trim()}>
              {sending ? "Sending…" : "Reply"}
            </button>
          </div>
        </form>
      ) : (
        post.removedAt && <p className="text-xs text-muted-foreground">Replies are closed while this post is hidden.</p>
      )}
    </>
  );
}

// ---------- Small parts ----------

const AVATAR_TONES = ["bg-rose-100 text-rose-800", "bg-amber-100 text-amber-800", "bg-emerald-100 text-emerald-800", "bg-sky-100 text-sky-800", "bg-violet-100 text-violet-800", "bg-orange-100 text-orange-800"];
const tone = (name: string) => AVATAR_TONES[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_TONES.length];

function Byline({ name, at, category, mine, edited }: { name: string; at: string; category?: CommunityCategory; mine?: boolean; edited?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
      <span className={`w-6 h-6 rounded-full flex items-center justify-center font-semibold text-[11px] shrink-0 ${tone(name)}`} aria-hidden>
        {name.charAt(0).toUpperCase()}
      </span>
      <span className="font-medium text-foreground">{name}</span>
      {mine && <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent text-[10px] font-medium">You</span>}
      <span>·</span>
      <time dateTime={at}>{timeAgo(at)}</time>
      {edited && <span>· edited</span>}
      {category && <span className="px-2 py-0.5 rounded-full bg-muted text-[11px] text-muted-foreground">{categoryLabel(category)}</span>}
    </div>
  );
}

function LikeButton({ liked, count, onClick, small }: { liked: boolean; count: number; onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={liked}
      aria-label={liked ? "Unlike" : "Like"}
      className={`flex items-center gap-1.5 ${small ? "text-[11px]" : "text-xs"} ${liked ? "text-accent font-medium" : "text-muted-foreground hover:text-foreground"}`}
    >
      <Heart className={`${small ? "w-3 h-3" : "w-3.5 h-3.5"} ${liked ? "fill-current" : ""}`} /> {count}
    </button>
  );
}

function Hidden({ reason }: { reason?: string }) {
  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
      <EyeOff className="w-3.5 h-3.5" /> Hidden from the Community{reason ? `: ${reason}` : ""}
    </p>
  );
}

function ItemMenu({ kind, item, actions }: { kind: ContentKind; item: CommunityPost | CommunityReply; actions: PostActions }) {
  const target: Target = { kind, id: item.id, userId: item.userId, authorName: item.authorName };
  const admin = !!actions.me?.isAdmin;
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Menu
        align="right"
        button={(toggle) => (
          <button type="button" onClick={toggle} aria-label={kind === "post" ? "Post options" : "Reply options"} className="p-1 rounded-md text-muted-foreground hover:bg-muted">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        )}
      >
        {(close) => {
          const pick = (fn: () => void) => () => {
            close();
            fn();
          };
          return (
            <>
              {item.mine && kind === "post" && (
                <MenuItem onClick={pick(() => actions.onEdit(item as CommunityPost))}>
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </MenuItem>
              )}
              {item.mine && (
                <MenuItem danger onClick={pick(() => actions.onDelete(kind, item.id))}>
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </MenuItem>
              )}
              {!item.mine && (
                <>
                  <MenuItem onClick={pick(() => actions.onReport(target))}>
                    <Flag className="w-3.5 h-3.5" /> Report
                  </MenuItem>
                  <MenuItem onClick={pick(() => actions.onBlock(target))}>
                    <UserX className="w-3.5 h-3.5" /> Block {item.authorName}
                  </MenuItem>
                </>
              )}
              {admin && (
                <>
                  <div className="my-1 border-t border-border" />
                  <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Moderator
                  </p>
                  {item.removedAt ? (
                    <MenuItem onClick={pick(() => actions.onModerate(kind, item.id, "restore"))}>
                      <RotateCcw className="w-3.5 h-3.5" /> Put back up
                    </MenuItem>
                  ) : (
                    <MenuItem danger onClick={pick(() => actions.onModerate(kind, item.id, "remove"))}>
                      <EyeOff className="w-3.5 h-3.5" /> Remove {kind}
                    </MenuItem>
                  )}
                  {!item.mine && (
                    <MenuItem danger onClick={pick(() => actions.onBan(target))}>
                      <Ban className="w-3.5 h-3.5" /> Ban from posting
                    </MenuItem>
                  )}
                </>
              )}
            </>
          );
        }}
      </Menu>
    </div>
  );
}

function Banner({ tone: t, children, onClose }: { tone: "ok" | "warn" | "error"; children: ReactNode; onClose?: () => void }) {
  const cls = {
    ok: "bg-emerald-50 border-emerald-200 text-emerald-900",
    warn: "bg-amber-50 border-amber-200 text-amber-900",
    error: "bg-rose-50 border-rose-200 text-rose-900",
  }[t];
  return (
    <div role={t === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-xs flex items-center gap-2 ${cls}`}>
      {t === "ok" && <Check className="w-3.5 h-3.5 shrink-0" />}
      <span className="flex-1">{children}</span>
      {onClose && (
        <button type="button" onClick={onClose} className="underline">
          Dismiss
        </button>
      )}
    </div>
  );
}

// ---------- Modals ----------

function Composer({ edit, authorName, onClose, onSave }: { edit?: CommunityPost; authorName: string; onClose: () => void; onSave: (p: NewPost) => Promise<void> }) {
  const [p, setP] = useState<NewPost>({ category: edit?.category ?? "tips", title: edit?.title ?? "", body: edit?.body ?? "" });
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    const issue = postProblem(p);
    if (issue) return setProblem(issue);
    setSaving(true);
    try {
      await onSave(p);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Your post didn't save.");
      setSaving(false);
    }
  };
  return (
    <Modal label={edit ? "Edit post" : "New post"} onClose={onClose} maxWidth="max-w-lg">
      <ModalHeader title={edit ? "Edit post" : "New post"} subtitle={`Posting as ${authorName}. Change your shop name in Settings.`} onClose={onClose} />
      <form
        className="p-5 space-y-4 overflow-y-auto"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Category">
          <select className={inputClass} value={p.category} onChange={(e) => setP({ ...p, category: e.target.value as CommunityCategory })}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}: {c.hint}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title">
          <input className={inputClass} maxLength={LIMITS.title} value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} placeholder="What's it about?" autoFocus />
        </Field>
        <Field label="Post">
          <textarea
            className={`${inputClass} min-h-40`}
            maxLength={LIMITS.body}
            value={p.body}
            onChange={(e) => setP({ ...p, body: e.target.value })}
            placeholder="Share the details: what you tried, what worked, what you're wondering."
          />
        </Field>
        {problem && <p className="text-xs text-destructive">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryButton} disabled={saving}>
            {saving ? "Saving…" : edit ? "Save" : "Post"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ReportModal({ target, onClose, onSend }: { target: Target; onClose: () => void; onSend: (r: ReportReason, note: string) => Promise<void> }) {
  const [reason, setReason] = useState<ReportReason>("spam");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  return (
    <Modal label="Report" onClose={onClose}>
      <ModalHeader title={`Report this ${target.kind}`} subtitle={`By ${target.authorName}. They won't know who reported it.`} onClose={onClose} icon={<Flag className="w-4 h-4 text-destructive" />} />
      <form
        className="p-5 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setSending(true);
          await onSend(reason, note).finally(() => setSending(false));
        }}
      >
        <fieldset className="space-y-1.5">
          <legend className="text-[12px] font-medium text-muted-foreground mb-1">What's wrong with it?</legend>
          {REPORT_REASONS.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm text-foreground">
              <input type="radio" name="reason" checked={reason === r.id} onChange={() => setReason(r.id)} className="accent-[var(--accent)]" />
              {r.label}
            </label>
          ))}
        </fieldset>
        <Field label="Anything else a moderator should know? (optional)">
          <textarea className={`${inputClass} min-h-16`} maxLength={LIMITS.note} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryButton} disabled={sending}>
            Send report
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BanModal({ target, onClose, onBan }: { target: Target; onClose: () => void; onBan: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal label="Ban from posting" onClose={onClose}>
      <ModalHeader title={`Ban ${target.authorName} from posting?`} subtitle="They can still read the Community but can't post or reply. Lift it any time from Blocked." onClose={onClose} />
      <form
        className="p-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onBan(reason);
        }}
      >
        <Field label="Reason (only moderators see this)">
          <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Repeated spam" />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={`${primaryButton} !bg-destructive`}>
            Ban from posting
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Confirm({ title, text, confirm, onClose, onConfirm }: { title: string; text: string; confirm: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal label={title} onClose={onClose}>
      <ModalHeader title={title} onClose={onClose} />
      <div className="p-5 space-y-4">
        <p className="text-sm text-muted-foreground">{text}</p>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={primaryButton} onClick={onConfirm}>
            {confirm}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Moderation ----------

function ReportQueue({ queue, actions }: { queue: ReportedItem[]; actions: PostActions }) {
  if (!queue.length) return <EmptyState icon={ShieldCheck} title="Nothing to review" text="Reported posts and replies show up here. Three reports hide something automatically until you decide." />;
  return (
    <ul className="space-y-3">
      {queue.map((q) => (
        <li key={`${q.kind}:${q.targetId}`} className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 font-medium">
              {q.reportCount} {q.reportCount === 1 ? "report" : "reports"}
            </span>
            {q.reasons.map((r) => (
              <span key={r} className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {reasonLabel(r)}
              </span>
            ))}
            {q.removedAt && (
              <span className="flex items-center gap-1 text-destructive">
                <EyeOff className="w-3 h-3" /> Hidden
              </span>
            )}
            <span className="text-muted-foreground ml-auto">{timeAgo(q.firstReportedAt)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {q.kind === "post" ? "Post" : "Reply"} by <span className="font-medium text-foreground">{q.authorName}</span>
            {q.kind === "reply" && q.title && <> on “{q.title}”</>}
          </p>
          {q.kind === "post" && <p className="text-sm font-semibold text-foreground">{q.title}</p>}
          <p className="text-sm text-foreground whitespace-pre-wrap break-words">{excerpt(q.body, 400)}</p>
          {q.notes.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {q.notes.map((n, i) => (
                <li key={i}>“{n}”</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {!q.removedAt ? (
              <button type="button" className={`${primaryButton} !bg-destructive !py-1.5 !text-xs`} onClick={() => actions.onModerate(q.kind, q.targetId, "remove")}>
                <EyeOff className="w-3.5 h-3.5" /> Remove
              </button>
            ) : (
              <button type="button" className={`${primaryButton} !bg-destructive !py-1.5 !text-xs`} onClick={() => actions.onModerate(q.kind, q.targetId, "remove")}>
                <Check className="w-3.5 h-3.5" /> Keep it removed
              </button>
            )}
            <button
              type="button"
              className={`${secondaryButton} !py-1.5 !text-xs`}
              onClick={() => actions.onModerate(q.kind, q.targetId, q.removedAt ? "restore" : "dismiss")}
            >
              <RotateCcw className="w-3.5 h-3.5" /> {q.removedAt ? "Put back up" : "It's fine, dismiss"}
            </button>
            <button
              type="button"
              className={`${secondaryButton} !py-1.5 !text-xs`}
              onClick={() => actions.onBan({ kind: q.kind, id: q.targetId, userId: q.authorId, authorName: q.authorName })}
            >
              <Ban className="w-3.5 h-3.5" /> Ban author
            </button>
            {q.postId && (
              <a href={`#/community?post=${q.postId}`} className={`${secondaryButton} !py-1.5 !text-xs`}>
                Open
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function BlockedList({
  blocked,
  me,
  onUnblock,
  loadBans,
  onUnban,
}: {
  blocked: BlockedSeller[];
  me: CommunityMe | null;
  onUnblock: (b: BlockedSeller) => void;
  loadBans: () => Promise<BannedSeller[]>;
  onUnban: (b: BannedSeller) => void;
}) {
  const [bans, setBans] = useState<BannedSeller[]>([]);
  useEffect(() => {
    if (me?.isAdmin) loadBans().then(setBans, () => setBans([]));
  }, [me?.isAdmin, loadBans]);
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Sellers you blocked</h2>
        <p className="text-xs text-muted-foreground">Their posts and replies are hidden from you. They aren't told.</p>
        {blocked.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3">You haven't blocked anyone.</p>
        ) : (
          <ul className="rounded-xl border border-border bg-card divide-y divide-border">
            {blocked.map((b) => (
              <li key={b.userId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-sm text-foreground">{b.name || "A seller"}</span>
                <button type="button" className={`${secondaryButton} !py-1 !text-xs`} onClick={() => onUnblock(b)}>
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {me?.isAdmin && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-accent" /> Banned from posting
          </h2>
          <p className="text-xs text-muted-foreground">Only moderators see this list.</p>
          {bans.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3">No one is banned.</p>
          ) : (
            <ul className="rounded-xl border border-border bg-card divide-y divide-border">
              {bans.map((b) => (
                <li key={b.userId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0">
                    <span className="block text-sm text-foreground">{b.name || "A seller"}</span>
                    {b.reason && <span className="block text-xs text-muted-foreground truncate">{b.reason}</span>}
                  </span>
                  <button
                    type="button"
                    className={`${secondaryButton} !py-1 !text-xs`}
                    onClick={() => {
                      setBans((l) => l.filter((x) => x.userId !== b.userId));
                      onUnban(b);
                    }}
                  >
                    Lift ban
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
