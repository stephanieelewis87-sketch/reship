import type { ReactNode } from "react";
import { Ban, Check, EyeOff, Flag, MoreHorizontal, Pencil, RotateCcw, ShieldCheck, Trash2, UserX, XCircle } from "lucide-react";
import type { CommunityMe, CommunityPost, CommunityReply, ContentKind, ReactionType, RsvpStatus } from "@/lib/community";
import { Menu, MenuItem } from "../ui";

// Someone to block, report or ban, from a post or comment's menu.
export interface Target {
  kind: ContentKind;
  id: string;
  userId: string;
  authorName: string;
}

// Everything a post, comment or meetup can do, handed down from the page.
export interface PostActions {
  me: CommunityMe | null;
  authorName: string;
  onReact: (kind: ContentKind, id: string, reaction: ReactionType | null) => void;
  onComment: (postId: string, body: string) => Promise<void>;
  onRsvp: (post: CommunityPost, status: RsvpStatus | null) => void;
  onReport: (t: Target) => void;
  onBlock: (t: Target) => void;
  onBan: (t: Target) => void;
  onModerate: (kind: ContentKind, id: string, action: "remove" | "restore" | "dismiss") => void;
  onDelete: (kind: ContentKind, id: string) => void;
  onEdit: (p: CommunityPost) => void;
  onCancelMeetup: (p: CommunityPost, cancelled: boolean) => void;
}

const AVATAR_TONES = [
  "bg-rose-100 text-rose-800",
  "bg-amber-100 text-amber-800",
  "bg-emerald-100 text-emerald-800",
  "bg-sky-100 text-sky-800",
  "bg-violet-100 text-violet-800",
  "bg-orange-100 text-orange-800",
];
export const tone = (name: string) => AVATAR_TONES[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR_TONES.length];

export function Avatar({ name, size = "md", ring }: { name: string; size?: "xs" | "sm" | "md" | "lg"; ring?: boolean }) {
  const dims = { xs: "w-6 h-6 text-[10px]", sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-11 h-11 text-base" }[size];
  return (
    <span className={`${dims} ${tone(name)} ${ring ? "ring-2 ring-card" : ""} rounded-full flex items-center justify-center font-semibold shrink-0 select-none`} aria-hidden>
      {(name.trim().charAt(0) || "?").toUpperCase()}
    </span>
  );
}

// Overlapping faces: the people who posted lately, or who's going to a meetup.
export function AvatarStack({ names, max = 5, size = "xs" }: { names: string[]; max?: number; size?: "xs" | "sm" }) {
  const shown = names.slice(0, max);
  return (
    <span className="flex -space-x-1.5" aria-hidden>
      {shown.map((n, i) => (
        <Avatar key={`${n}-${i}`} name={n} size={size} ring />
      ))}
    </span>
  );
}

export function Hidden({ reason }: { reason?: string }) {
  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
      <EyeOff className="w-3.5 h-3.5" /> Hidden from the group{reason ? `: ${reason}` : ""}
    </p>
  );
}

export function Banner({ tone: t, children, onClose }: { tone: "ok" | "warn" | "error"; children: ReactNode; onClose?: () => void }) {
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

export function ItemMenu({ kind, item, actions }: { kind: ContentKind; item: CommunityPost | CommunityReply; actions: PostActions }) {
  const target: Target = { kind, id: item.id, userId: item.userId, authorName: item.authorName };
  const admin = !!actions.me?.isAdmin;
  const post = kind === "post" ? (item as CommunityPost) : null;
  const noun = kind === "reply" ? "comment" : post?.meetup ? "meetup" : "post";
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Menu
        align="right"
        button={(toggle) => (
          <button type="button" onClick={toggle} aria-label={`${noun[0].toUpperCase()}${noun.slice(1)} options`} className="p-1.5 rounded-full text-muted-foreground hover:bg-muted">
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
              {item.mine && post && (
                <MenuItem onClick={pick(() => actions.onEdit(post))}>
                  <Pencil className="w-3.5 h-3.5" /> Edit {noun}
                </MenuItem>
              )}
              {item.mine && post?.meetup && (
                <MenuItem onClick={pick(() => actions.onCancelMeetup(post, !post.meetup!.cancelledAt))}>
                  {post.meetup.cancelledAt ? <RotateCcw className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {post.meetup.cancelledAt ? "It's back on" : "Cancel meetup"}
                </MenuItem>
              )}
              {item.mine && (
                <MenuItem danger onClick={pick(() => actions.onDelete(kind, item.id))}>
                  <Trash2 className="w-3.5 h-3.5" /> Delete {noun}
                </MenuItem>
              )}
              {!item.mine && (
                <>
                  <MenuItem onClick={pick(() => actions.onReport(target))}>
                    <Flag className="w-3.5 h-3.5" /> Report {noun}
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
                      <EyeOff className="w-3.5 h-3.5" /> Remove {noun}
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
