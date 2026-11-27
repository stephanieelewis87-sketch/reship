import { useEffect, useState } from "react";
import { Ban, Check, EyeOff, Flag, RotateCcw, ShieldCheck } from "lucide-react";
import { type BannedSeller, type BlockedSeller, type CommunityMe, LIMITS, REPORT_REASONS, type ReportReason, type ReportedItem, excerpt, reasonLabel, timeAgo } from "@/lib/community";
import { EmptyState, Field, Modal, ModalHeader, inputClass, primaryButton, secondaryButton } from "../ui";
import type { PostActions, Target } from "./parts";

// Reporting, blocking and the moderator's tools.

export function ReportModal({ target, onClose, onSend }: { target: Target; onClose: () => void; onSend: (r: ReportReason, note: string) => Promise<void> }) {
  const [reason, setReason] = useState<ReportReason>("spam");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  return (
    <Modal label="Report" onClose={onClose}>
      <ModalHeader title={`Report this ${target.kind === "reply" ? "comment" : "post"}`} subtitle={`By ${target.authorName}. They won't know who reported it.`} onClose={onClose} icon={<Flag className="w-4 h-4 text-destructive" />} />
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

export function BanModal({ target, onClose, onBan }: { target: Target; onClose: () => void; onBan: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal label="Ban from posting" onClose={onClose}>
      <ModalHeader title={`Ban ${target.authorName} from posting?`} subtitle="They can still read the group but can't post, comment or RSVP. Lift it any time from Blocked." onClose={onClose} />
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

export function Confirm({ title, text, confirm, onClose, onConfirm }: { title: string; text: string; confirm: string; onClose: () => void; onConfirm: () => void }) {
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

export function ReportQueue({ queue, actions }: { queue: ReportedItem[]; actions: PostActions }) {
  if (!queue.length) return <EmptyState icon={ShieldCheck} title="Nothing to review" text="Reported posts and comments show up here. Three reports hide something automatically until you decide." />;
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
            {q.kind === "post" ? "Post" : "Comment"} by <span className="font-medium text-foreground">{q.authorName}</span>
            {q.kind === "reply" && q.title && <> on “{q.title}”</>}
          </p>
          {q.kind === "post" && q.title && <p className="text-sm font-semibold text-foreground">{q.title}</p>}
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

export function BlockedList({
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
        <p className="text-xs text-muted-foreground">Their posts, comments and RSVPs are hidden from you. They aren't told.</p>
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
