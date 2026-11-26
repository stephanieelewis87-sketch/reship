import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Link2, MessageCircle, SendHorizontal, ThumbsUp } from "lucide-react";
import {
  type CommunityCategory,
  type CommunityPost,
  type CommunityReply,
  LIMITS,
  type NewPost,
  POST_TOPICS,
  REACTIONS,
  type ReactionType,
  categoryLabel,
  postProblem,
  reactionOf,
  replyProblem,
  timeAgo,
  topReactions,
} from "@/lib/community";
import { go } from "../shell/route";
import { Modal, ModalHeader, inputClass, primaryButton, secondaryButton } from "../ui";
import { MeetupAttachment } from "./meetups";
import { Avatar, Hidden, ItemMenu, type PostActions } from "./parts";

// ---------- "What's on your mind?" ----------

export function ComposerBar({ name, disabled, onPost, onMeetup }: { name: string; disabled: boolean; onPost: () => void; onMeetup: () => void }) {
  const first = name.split(/[\s'’]/)[0] || name;
  return (
    <div className="rounded-xl border border-border bg-card shadow-[var(--card-shadow)] p-3 md:p-4">
      <div className="flex items-center gap-3">
        <Avatar name={name} />
        <button
          type="button"
          onClick={onPost}
          disabled={disabled}
          className="flex-1 text-left rounded-full bg-muted hover:bg-muted/70 px-4 py-2.5 text-sm text-muted-foreground transition-colors disabled:opacity-60"
        >
          What's on your mind, {first}?
        </button>
      </div>
      <div className="mt-3 pt-2.5 border-t border-border grid grid-cols-2 gap-1">
        <button type="button" onClick={onPost} disabled={disabled} className="flex items-center justify-center gap-2 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-60">
          <MessageCircle className="w-4 h-4 text-sky-600" /> Start a discussion
        </button>
        <button type="button" onClick={onMeetup} disabled={disabled} className="flex items-center justify-center gap-2 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-60">
          <CalendarPlus className="w-4 h-4 text-accent" /> Plan a meetup
        </button>
      </div>
    </div>
  );
}

// ---------- One post in the feed ----------

const SEE_MORE_AT = 420;

export function PostCard({ post, comments, actions, expanded = false }: { post: CommunityPost; comments: CommunityReply[]; actions: PostActions; expanded?: boolean }) {
  const [showAll, setShowAll] = useState(expanded);
  const [longOpen, setLongOpen] = useState(expanded);
  const [copied, setCopied] = useState(false);
  const commentRef = useRef<HTMLInputElement>(null);
  const open = () => go("community", { post: post.id });
  const long = post.body.length > SEE_MORE_AT && !longOpen;
  // A meetup with no extra details stores its name as the body; don't say it twice.
  const body = post.meetup && post.body.trim() === post.title.trim() ? "" : post.body;
  const shown = showAll ? comments : comments.slice(-2);
  const hiddenCount = post.replyCount - shown.length;
  const canComment = !!actions.me && !actions.me.banned && !post.removedAt;

  const share = async () => {
    const link = `${window.location.origin}${window.location.pathname}${window.location.search}#/community?post=${post.id}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      open();
    }
  };

  return (
    <article
      aria-label={post.title || `Post by ${post.authorName}`}
      className={`rounded-xl border bg-card shadow-[var(--card-shadow)] ${post.removedAt ? "border-dashed border-destructive/40" : "border-border"}`}
    >
      <header className="flex items-start gap-3 px-4 pt-4">
        <Avatar name={post.authorName} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground leading-tight">
            <span className="font-semibold">{post.authorName}</span>
            {post.mine && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-accent/15 text-accent text-[10px] font-medium align-middle">You</span>}
            {post.meetup && <span className="text-muted-foreground"> {post.mine ? "are" : "is"} hosting a meetup</span>}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
            <a href={`#/community?post=${post.id}`} className="hover:underline">
              <time dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>
            </a>
            {post.editedAt && <span>· edited</span>}
            {!post.meetup && (
              <>
                <span>·</span>
                <span className="px-1.5 py-px rounded-full bg-muted text-[11px]">{categoryLabel(post.category)}</span>
              </>
            )}
          </p>
        </div>
        <ItemMenu kind="post" item={post} actions={actions} />
      </header>

      <div className="px-4 pt-3">
        {post.title && !post.meetup && <h2 className="font-display text-[15px] font-semibold text-foreground leading-snug mb-1">{post.title}</h2>}
        {body && (
          <p className="text-[15px] text-foreground whitespace-pre-wrap break-words leading-relaxed">
            {long ? `${body.slice(0, SEE_MORE_AT).replace(/\s+\S*$/, "")}… ` : body}
            {long && (
              <button type="button" onClick={() => setLongOpen(true)} className="font-medium text-muted-foreground hover:underline">
                See more
              </button>
            )}
          </p>
        )}
        {post.removedAt && <Hidden reason={post.removedReason} />}
      </div>

      {post.meetup && !expanded && (
        <div className="px-4 pt-3">
          <MeetupAttachment post={post as CommunityPost & { meetup: NonNullable<CommunityPost["meetup"]> }} actions={actions} linked={!expanded} />
        </div>
      )}

      <ReactionSummary post={post} onComments={() => (expanded ? commentRef.current?.focus() : setShowAll(true))} />

      <div className="mx-4 border-t border-border grid grid-cols-3 py-1">
        <ReactButton current={post.myReaction} onReact={(r) => actions.onReact("post", post.id, r)} disabled={!actions.me || !!post.removedAt} />
        <button
          type="button"
          onClick={() => {
            setShowAll(true);
            window.setTimeout(() => commentRef.current?.focus(), 0);
          }}
          disabled={!canComment}
          className="flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          <MessageCircle className="w-[18px] h-[18px]" /> Comment
        </button>
        <button type="button" onClick={share} className="flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted">
          <Link2 className="w-[18px] h-[18px]" /> {copied ? "Link copied" : "Share"}
        </button>
      </div>

      {(shown.length > 0 || canComment) && (
        <div className="px-4 pb-3 pt-1 border-t border-border space-y-2.5">
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => (comments.length >= post.replyCount ? setShowAll(true) : open())}
              className="pt-2 text-sm font-medium text-muted-foreground hover:underline"
            >
              View {hiddenCount === 1 ? "1 more comment" : `${hiddenCount} more comments`}
            </button>
          )}
          {shown.length > 0 && (
            <ul className="space-y-2.5 pt-2">
              {shown.map((c) => (
                <Comment key={c.id} comment={c} actions={actions} />
              ))}
            </ul>
          )}
          {canComment && <CommentBox inputRef={commentRef} name={actions.authorName} onSend={(b) => actions.onComment(post.id, b)} meetup={!!post.meetup} />}
        </div>
      )}
    </article>
  );
}

// "👍❤️🎉 34 · 5 comments"
function ReactionSummary({ post, onComments }: { post: CommunityPost; onComments: () => void }) {
  const top = topReactions(post.reactions);
  if (!post.likeCount && !post.replyCount) return <div className="h-3" />;
  const others = post.likeCount - (post.myReaction ? 1 : 0);
  const label = post.myReaction ? (others ? `You and ${others} ${others === 1 ? "other" : "others"}` : "You") : String(post.likeCount);
  return (
    <div className="px-4 py-2.5 flex items-center justify-between text-[13px] text-muted-foreground">
      {post.likeCount > 0 ? (
        <span className="flex items-center gap-1.5" aria-label={`${post.likeCount} reactions`}>
          <span className="flex -space-x-0.5">
            {top.map((r) => (
              <span key={r} className="w-5 h-5 rounded-full bg-card ring-2 ring-card flex items-center justify-center text-[13px] leading-none" title={reactionOf(r).label}>
                {reactionOf(r).emoji}
              </span>
            ))}
          </span>
          {label}
        </span>
      ) : (
        <span />
      )}
      {post.replyCount > 0 && (
        <button type="button" onClick={onComments} className="hover:underline">
          {post.replyCount} {post.replyCount === 1 ? "comment" : "comments"}
        </button>
      )}
    </div>
  );
}

// Tap to Like (or take back your reaction). Hover, long-press or arrow up for the other emoji.
export function ReactButton({ current, onReact, disabled }: { current?: ReactionType; onReact: (r: ReactionType | null) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const pressed = useRef(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const later = (fn: () => void, ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fn, ms);
  };
  const r = current ? reactionOf(current) : null;
  const colour: Record<ReactionType, string> = { like: "text-sky-600", love: "text-rose-600", haha: "text-amber-600", wow: "text-amber-600", yay: "text-accent" };
  return (
    <div
      ref={wrap}
      className="relative"
      onMouseEnter={() => !disabled && later(() => setOpen(true), 450)}
      onMouseLeave={() => later(() => setOpen(false), 300)}
    >
      {open && (
        <div role="menu" aria-label="Pick a reaction" className="absolute bottom-full left-0 mb-1.5 z-30 flex gap-0.5 rounded-full border border-border bg-card shadow-lg px-1.5 py-1">
          {REACTIONS.map((x) => (
            <button
              key={x.id}
              type="button"
              role="menuitemradio"
              aria-checked={current === x.id}
              title={x.label}
              aria-label={x.label}
              onClick={() => {
                setOpen(false);
                onReact(current === x.id ? null : x.id);
              }}
              className={`w-9 h-9 rounded-full text-[22px] leading-none flex items-center justify-center transition-transform hover:scale-125 hover:-translate-y-0.5 ${current === x.id ? "bg-accent/15" : ""}`}
            >
              {x.emoji}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        disabled={disabled}
        aria-pressed={!!current}
        aria-label={r ? `${r.label}. Tap to take back your reaction` : "Like. Hold for more reactions"}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          pressed.current = false;
          later(() => {
            pressed.current = true;
            setOpen(true);
          }, 450);
        }}
        onPointerUp={() => window.clearTimeout(timer.current)}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        onClick={() => {
          if (pressed.current) {
            pressed.current = false;
            return;
          }
          setOpen(false);
          onReact(current ? null : "like");
        }}
        className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium hover:bg-muted disabled:opacity-50 select-none ${r ? colour[r.id] : "text-muted-foreground"}`}
      >
        {r && r.id !== "like" ? <span className="text-[17px] leading-none">{r.emoji}</span> : <ThumbsUp className={`w-[18px] h-[18px] ${r ? "fill-current" : ""}`} />}
        {r ? r.label : "Like"}
      </button>
    </div>
  );
}

// ---------- Comments ----------

function Comment({ comment: c, actions }: { comment: CommunityReply; actions: PostActions }) {
  return (
    <li className="flex items-start gap-2 group">
      <Avatar name={c.authorName} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1">
          <div className={`inline-block max-w-full rounded-2xl px-3 py-2 ${c.removedAt ? "bg-destructive/5 border border-dashed border-destructive/40" : "bg-muted"}`}>
            <p className="text-[13px] font-semibold text-foreground leading-tight">
              {c.authorName}
              {c.mine && <span className="ml-1 font-normal text-muted-foreground">(you)</span>}
            </p>
            <p className="text-sm text-foreground whitespace-pre-wrap break-words mt-0.5">{c.body}</p>
          </div>
          <span className="opacity-60 group-hover:opacity-100 focus-within:opacity-100">
            <ItemMenu kind="reply" item={c} actions={actions} />
          </span>
        </div>
        <div className="mt-1 ml-3 flex items-center gap-3 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => actions.onReact("reply", c.id, c.likedByMe ? null : "like")}
            aria-pressed={c.likedByMe}
            aria-label={`Like comment by ${c.authorName}`}
            disabled={!actions.me}
            className={`font-semibold hover:underline ${c.likedByMe ? "text-sky-600" : ""}`}
          >
            Like
          </button>
          <time dateTime={c.createdAt}>{timeAgo(c.createdAt)}</time>
          {c.likeCount > 0 && (
            <span className="flex items-center gap-1" aria-label={`${c.likeCount} likes`}>
              <span className="text-[11px]">👍</span>
              {c.likeCount}
            </span>
          )}
        </div>
        {c.removedAt && <Hidden reason={c.removedReason} />}
      </div>
    </li>
  );
}

function CommentBox({ name, onSend, inputRef, meetup }: { name: string; onSend: (body: string) => Promise<void>; inputRef: React.RefObject<HTMLInputElement>; meetup: boolean }) {
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const send = async () => {
    const p = replyProblem(draft);
    if (p) return setProblem(p);
    setSending(true);
    try {
      await onSend(draft);
      setDraft("");
      setProblem(null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Your comment didn't send.");
    } finally {
      setSending(false);
    }
  };
  return (
    <form
      className="flex items-start gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <Avatar name={name} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center rounded-full bg-muted pl-3.5 pr-1 focus-within:ring-1 focus-within:ring-accent">
          <input
            ref={inputRef}
            value={draft}
            maxLength={LIMITS.reply}
            onChange={(e) => {
              setDraft(e.target.value);
              setProblem(null);
            }}
            placeholder={meetup ? "Ask a question or coordinate…" : "Write a comment…"}
            aria-label="Write a comment"
            className="flex-1 min-w-0 bg-transparent py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <button type="submit" disabled={sending || !draft.trim()} aria-label="Send comment" className="p-1.5 rounded-full text-accent disabled:text-muted-foreground/50 hover:bg-card">
            <SendHorizontal className="w-4 h-4" />
          </button>
        </div>
        {problem && <p className="text-xs text-destructive mt-1 ml-3">{problem}</p>}
      </div>
    </form>
  );
}

// ---------- Writing a post ----------

export function PostComposer({
  edit,
  authorName,
  onClose,
  onSave,
  onMeetup,
}: {
  edit?: CommunityPost;
  authorName: string;
  onClose: () => void;
  onSave: (p: NewPost) => Promise<void>;
  onMeetup: () => void;
}) {
  const [p, setP] = useState<NewPost>({ category: edit?.category ?? "tips", title: edit?.title ?? "", body: edit?.body ?? "" });
  const [headline, setHeadline] = useState(!!edit?.title);
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
    <Modal label={edit ? "Edit post" : "Create post"} onClose={onClose} maxWidth="max-w-lg">
      <ModalHeader title={edit ? "Edit post" : "Create post"} onClose={onClose} />
      <form
        className="p-5 space-y-4 overflow-y-auto"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex items-center gap-3">
          <Avatar name={authorName} />
          <div>
            <p className="text-sm font-semibold text-foreground">{authorName}</p>
            <p className="text-xs text-muted-foreground">Posting to the Hubby group. Change your name in Settings.</p>
          </div>
        </div>
        {headline && (
          <input
            className={`${inputClass} !text-base font-semibold`}
            maxLength={LIMITS.title}
            value={p.title}
            onChange={(e) => setP({ ...p, title: e.target.value })}
            placeholder="Headline (optional)"
            aria-label="Headline"
          />
        )}
        <textarea
          className="w-full min-h-40 bg-transparent text-[17px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 outline-none resize-y"
          maxLength={LIMITS.body}
          value={p.body}
          onChange={(e) => {
            setP({ ...p, body: e.target.value });
            setProblem(null);
          }}
          placeholder={`What's on your mind, ${authorName.split(/[\s'’]/)[0] || authorName}? Share a tip, a win or a question.`}
          aria-label="Post"
          autoFocus
        />
        <fieldset>
          <legend className="text-[12px] font-medium text-muted-foreground mb-1.5">Topic</legend>
          <div className="flex flex-wrap gap-1.5">
            {POST_TOPICS.map((c) => (
              <button
                key={c.id}
                type="button"
                title={c.hint}
                aria-pressed={p.category === c.id}
                onClick={() => setP({ ...p, category: c.id as CommunityCategory })}
                className={`px-2.5 py-1 rounded-full border text-xs ${p.category === c.id ? "border-accent bg-accent/15 text-accent font-medium" : "border-border text-muted-foreground hover:bg-muted"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>
        {!edit && (
          <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
            <span className="text-xs text-muted-foreground flex-1">Add to your post</span>
            {!headline && (
              <button type="button" onClick={() => setHeadline(true)} className="text-xs font-medium text-foreground px-2 py-1 rounded-md hover:bg-muted">
                Headline
              </button>
            )}
            <button type="button" onClick={onMeetup} className="text-xs font-medium text-accent px-2 py-1 rounded-md hover:bg-muted flex items-center gap-1">
              <CalendarPlus className="w-3.5 h-3.5" /> Meetup
            </button>
          </div>
        )}
        {problem && <p className="text-xs text-destructive">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={`${primaryButton} min-w-24`} disabled={saving || !p.body.trim()}>
            {saving ? "Posting…" : edit ? "Save" : "Post"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
