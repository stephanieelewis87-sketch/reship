import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CalendarPlus, Check, Clock, HelpCircle, MapPin, Navigation, Search, Users, X } from "lucide-react";
import {
  type Attendee,
  type CommunityPost,
  LIMITS,
  MEETUP_LIMITS,
  type Meetup,
  type NewMeetup,
  type RsvpStatus,
  isFull,
  mapsUrl,
  meetupIcs,
  meetupProblem,
  meetupState,
  meetupWhen,
  spotsLeft,
} from "@/lib/community";
import { go } from "../shell/route";
import { EmptyState, Field, Modal, ModalHeader, inputClass, primaryButton, secondaryButton } from "../ui";
import { Avatar, type PostActions } from "./parts";

export type MeetupPost = CommunityPost & { meetup: Meetup };

// The calendar-page date tile: "DEC / 6".
export function DateTile({ iso, size = "md", muted }: { iso: string; size?: "sm" | "md" | "lg"; muted?: boolean }) {
  const d = new Date(iso);
  const dims = { sm: "w-10 h-11", md: "w-14 h-15", lg: "w-16 h-[70px]" }[size];
  const day = { sm: "text-base", md: "text-2xl", lg: "text-[28px]" }[size];
  return (
    <span className={`${dims} shrink-0 rounded-lg overflow-hidden border border-border bg-card flex flex-col text-center ${muted ? "opacity-60" : ""}`} aria-hidden>
      <span className={`${muted ? "bg-muted-foreground" : "bg-accent"} text-accent-foreground text-[10px] font-semibold uppercase tracking-wider py-0.5`}>
        {d.toLocaleDateString(undefined, { month: "short" })}
      </span>
      <span className={`flex-1 flex items-center justify-center font-display font-semibold text-foreground ${day}`}>{d.getDate()}</span>
    </span>
  );
}

function StateBadge({ m }: { m: Meetup }) {
  const s = meetupState(m);
  if (s === "cancelled") return <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-semibold">Cancelled</span>;
  if (s === "happening") return <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-semibold">Happening now</span>;
  if (s === "past") return <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px] font-semibold">Past</span>;
  return null;
}

function headcount(m: Meetup) {
  const parts = [`${m.goingCount} going`];
  if (m.maybeCount) parts.push(`${m.maybeCount} maybe`);
  const left = spotsLeft(m);
  if (left !== undefined && meetupState(m) === "upcoming") parts.push(left ? `${left} ${left === 1 ? "spot" : "spots"} left` : "Full");
  return parts.join(" · ");
}

// Going / Maybe / Can't go. Your answer is highlighted; tap it again to take it back.
export function RsvpButtons({ post, actions, size = "md" }: { post: MeetupPost; actions: PostActions; size?: "md" | "lg" }) {
  const m = post.meetup;
  const state = meetupState(m);
  const can = !!actions.me && !actions.me.banned && !post.removedAt;
  if (state === "cancelled") return <p className="text-xs text-rose-700">The host cancelled this meetup.</p>;
  if (state === "past") return <p className="text-xs text-muted-foreground">{m.myRsvp === "going" ? "You went to this one." : "This meetup already happened."}</p>;
  if (!can) return null;
  const full = isFull(m);
  const pad = size === "lg" ? "py-2 px-4 text-sm" : "py-1.5 px-3 text-[13px]";
  const btn = (status: RsvpStatus | null, label: string, Icon: typeof Check, active: boolean, disabled = false) => (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation();
        actions.onRsvp(post, active ? null : status);
      }}
      className={`${pad} rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active ? (status === "going" ? "bg-accent text-accent-foreground" : "bg-accent/15 text-accent") : "bg-muted text-foreground hover:bg-muted/70"
      }`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Are you going?">
      {btn("going", m.myRsvp === "going" ? "Going" : full ? "Full" : "Going", Check, m.myRsvp === "going", full)}
      {btn("maybe", "Maybe", HelpCircle, m.myRsvp === "maybe")}
      {m.myRsvp && btn(null, "Can't go", X, false)}
    </div>
  );
}

// The meetup card inside a feed post: when, where, who's coming, and the RSVP buttons.
export function MeetupAttachment({ post, actions, linked }: { post: MeetupPost; actions: PostActions; linked?: boolean }) {
  const m = post.meetup;
  const state = meetupState(m);
  const dim = state === "past" || state === "cancelled";
  const open = () => go("community", { post: post.id });
  return (
    <div className={`rounded-xl border overflow-hidden ${state === "cancelled" ? "border-rose-200" : "border-border"}`}>
      <div className={`h-2 ${dim ? "bg-muted" : "bg-[image:var(--metal)]"}`} />
      <div className="p-3.5 flex gap-3.5 bg-accent-soft/40">
        <DateTile iso={m.startsAt} muted={dim} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2 flex-wrap">
            <h3 className={`font-display text-base font-semibold leading-snug text-foreground ${state === "cancelled" ? "line-through decoration-rose-400" : ""}`}>
              {linked ? (
                <a href={`#/community?post=${post.id}`} className="hover:underline">
                  {post.title}
                </a>
              ) : (
                post.title
              )}
            </h3>
            <StateBadge m={m} />
          </div>
          <p className="mt-1 text-[13px] text-foreground flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-accent shrink-0" /> {meetupWhen(m.startsAt, m.endsAt)}
          </p>
          <p className="mt-0.5 text-[13px] text-foreground flex items-start gap-1.5 min-w-0">
            <MapPin className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
            <span className="min-w-0">
              <span className="font-medium">{m.placeName}</span>
              {m.address && <span className="text-muted-foreground"> · {m.address}</span>}
            </span>
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> {headcount(m)}
            {m.myRsvp && state === "upcoming" && <span className="text-accent font-medium">· You're {m.myRsvp === "going" ? "going" : "a maybe"}</span>}
          </p>
        </div>
      </div>
      <div className="px-3.5 py-2.5 border-t border-border flex items-center justify-between gap-2 flex-wrap bg-card">
        <RsvpButtons post={post} actions={actions} />
        {linked && (
          <button type="button" onClick={open} className="text-[13px] font-medium text-accent hover:underline ml-auto">
            Details and who's going
          </button>
        )}
      </div>
    </div>
  );
}

// The top of a meetup's own page: directions, calendar, and the guest list.
export function MeetupDetails({ post, attendees, actions }: { post: MeetupPost; attendees: Attendee[]; actions: PostActions }) {
  const m = post.meetup;
  const [list, setList] = useState<RsvpStatus>("going");
  const going = attendees.filter((a) => a.status === "going");
  const maybe = attendees.filter((a) => a.status === "maybe");
  const shown = list === "going" ? going : maybe;
  const left = spotsLeft(m);
  const addToCalendar = () => {
    const link = `${window.location.origin}${window.location.pathname}${window.location.search}#/community?post=${post.id}`;
    const blob = new Blob([meetupIcs(post, link)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${post.title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "meetup"}.ics`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section aria-label="Meetup details" className="rounded-xl border border-border bg-card shadow-[var(--card-shadow)] overflow-hidden">
      <div className="h-24 md:h-28 bg-[image:var(--metal)] relative">
        <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "14px 14px" }} />
      </div>
      <div className="px-4 md:px-5 pb-4 -mt-9 relative">
        <DateTile iso={m.startsAt} size="lg" muted={meetupState(m) === "cancelled"} />
        <div className="mt-2.5 flex items-start gap-2 flex-wrap">
          <h2 className="font-serif text-2xl font-medium text-foreground leading-tight">{post.title}</h2>
          <StateBadge m={m} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Hosted by <span className="font-medium text-foreground">{post.mine ? "you" : post.authorName}</span>
        </p>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex items-start gap-2">
            <dt className="sr-only">When</dt>
            <CalendarDays className="w-4 h-4 text-accent mt-0.5 shrink-0" />
            <dd className="text-foreground">{meetupWhen(m.startsAt, m.endsAt)}</dd>
          </div>
          <div className="flex items-start gap-2">
            <dt className="sr-only">Where</dt>
            <MapPin className="w-4 h-4 text-accent mt-0.5 shrink-0" />
            <dd className="text-foreground">
              <span className="font-medium">{m.placeName}</span>
              {m.address && <span className="block text-muted-foreground">{m.address}</span>}
            </dd>
          </div>
          <div className="flex items-start gap-2">
            <dt className="sr-only">Who</dt>
            <Users className="w-4 h-4 text-accent mt-0.5 shrink-0" />
            <dd className="text-foreground">
              {headcount(m)}
              {m.capacity && <span className="text-muted-foreground"> · {m.capacity} spots in all</span>}
              {left === 0 && meetupState(m) === "upcoming" && <span className="block text-xs text-muted-foreground">It's full. Say Maybe and keep an eye out in case someone drops.</span>}
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <RsvpButtons post={post} actions={actions} size="lg" />
          <span className="flex gap-2 ml-auto">
            <a href={mapsUrl(m.placeName, m.address)} target="_blank" rel="noreferrer" className={`${secondaryButton} !py-2`}>
              <Navigation className="w-4 h-4" /> Directions
            </a>
            {meetupState(m) !== "past" && (
              <button type="button" onClick={addToCalendar} className={`${secondaryButton} !py-2`}>
                <CalendarPlus className="w-4 h-4" /> Add to calendar
              </button>
            )}
          </span>
        </div>
      </div>

      <div className="border-t border-border px-4 md:px-5 py-4">
        <div className="flex items-center gap-4 border-b border-border -mx-1 px-1" role="tablist" aria-label="Guest list">
          {(
            [
              ["going", `Going (${going.length})`],
              ["maybe", `Maybe (${maybe.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={list === key}
              onClick={() => setList(key)}
              className={`pb-2 -mb-px text-sm border-b-2 ${list === key ? "border-accent text-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">{list === "going" ? "Nobody yet. Be the first!" : "No maybes."}</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 pt-3">
            {shown.map((a) => (
              <li key={a.userId} className="flex items-center gap-2.5 min-w-0">
                <Avatar name={a.name} size="sm" />
                <span className="text-sm text-foreground truncate">
                  {a.name}
                  {a.mine && <span className="text-muted-foreground"> (you)</span>}
                </span>
                {a.userId === post.userId && <span className="px-1.5 py-0.5 rounded bg-accent/15 text-accent text-[10px] font-semibold shrink-0">Host</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ---------- The Meetups tab ----------

type MeetupView = "upcoming" | "going" | "hosting" | "past";

export function MeetupsTab({ posts, actions, onPlan }: { posts: MeetupPost[]; actions: PostActions; onPlan: () => void }) {
  const [view, setView] = useState<MeetupView>("upcoming");
  const [search, setSearch] = useState("");
  const now = Date.now();
  const lists = useMemo(() => {
    const live = (p: MeetupPost) => ["upcoming", "happening"].includes(meetupState(p.meetup, now));
    const soonest = (a: MeetupPost, b: MeetupPost) => a.meetup.startsAt.localeCompare(b.meetup.startsAt);
    return {
      upcoming: posts.filter(live).sort(soonest),
      going: posts.filter((p) => live(p) && p.meetup.myRsvp).sort(soonest),
      hosting: posts.filter((p) => p.mine).sort((a, b) => b.meetup.startsAt.localeCompare(a.meetup.startsAt)),
      past: posts.filter((p) => !live(p)).sort((a, b) => b.meetup.startsAt.localeCompare(a.meetup.startsAt)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts]);
  const q = search.trim().toLowerCase();
  const shown = lists[view].filter((p) => !q || `${p.title} ${p.body} ${p.meetup.placeName} ${p.meetup.address} ${p.authorName}`.toLowerCase().includes(q));
  const tabs: { key: MeetupView; label: string }[] = [
    { key: "upcoming", label: "Upcoming" },
    { key: "going", label: `You're going${lists.going.length ? ` (${lists.going.length})` : ""}` },
    { key: "hosting", label: "Hosting" },
    { key: "past", label: "Past" },
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card shadow-[var(--card-shadow)] p-4 flex items-center gap-4 flex-wrap">
        <span className="w-11 h-11 rounded-full bg-accent/15 text-accent flex items-center justify-center shrink-0">
          <CalendarPlus className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-48">
          <p className="text-sm font-semibold text-foreground">Get together in person</p>
          <p className="text-xs text-muted-foreground">Thrift crawls, packing parties, flea market mornings. Pick a time and place and the group can RSVP and chat about it.</p>
        </div>
        <button type="button" className={primaryButton} onClick={onPlan} disabled={!actions.me || actions.me.banned}>
          <CalendarPlus className="w-4 h-4" /> Plan a meetup
        </button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 rounded-lg bg-muted p-1 overflow-x-auto" role="tablist" aria-label="Which meetups">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={view === t.key}
              onClick={() => setView(t.key)}
              className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap ${view === t.key ? "bg-card text-foreground font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="relative flex-1 min-w-44">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className={`${inputClass} pl-8`} placeholder="Search by name, place or town" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search meetups" />
        </label>
      </div>
      {shown.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={q ? "No meetups match" : view === "going" ? "You haven't RSVP'd to anything yet" : view === "hosting" ? "You haven't hosted a meetup" : view === "past" ? "No past meetups" : "No meetups planned yet"}
          text={q ? "Try another place or town." : "Plan one and invite the group. Coffee and a thrift crawl is a great start."}
          action={actions.me && !actions.me.banned && !q ? { label: "Plan a meetup", onClick: onPlan } : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {shown.map((p) => (
            <li key={p.id} className="space-y-1.5">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 px-1">
                <Avatar name={p.authorName} size="xs" /> Hosted by <span className="font-medium text-foreground">{p.mine ? "you" : p.authorName}</span>
                {p.replyCount > 0 && (
                  <a href={`#/community?post=${p.id}`} className="ml-auto hover:underline">
                    {p.replyCount} {p.replyCount === 1 ? "comment" : "comments"}
                  </a>
                )}
              </p>
              <MeetupAttachment post={p} actions={actions} linked />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The sidebar's short list of what's coming up.
export function UpcomingMeetups({ posts, onPlan, compact }: { posts: MeetupPost[]; onPlan?: () => void; compact?: boolean }) {
  if (compact) {
    if (!posts.length) return null;
    return (
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 lg:hidden" aria-label="Upcoming meetups">
        {posts.slice(0, 6).map((p) => (
          <a
            key={p.id}
            href={`#/community?post=${p.id}`}
            className="shrink-0 w-60 rounded-xl border border-border bg-card shadow-[var(--card-shadow)] p-2.5 flex gap-2.5 items-center hover:border-accent/40"
          >
            <DateTile iso={p.meetup.startsAt} size="sm" />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-foreground truncate">{p.title}</span>
              <span className="block text-[11px] text-muted-foreground truncate">{p.meetup.placeName}</span>
              <span className="block text-[11px] text-accent font-medium">{p.meetup.myRsvp === "going" ? "You're going" : `${p.meetup.goingCount} going`}</span>
            </span>
          </a>
        ))}
      </div>
    );
  }
  return (
    <section className="rounded-xl border border-border bg-card shadow-[var(--card-shadow)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground">Upcoming meetups</h2>
        <a href="#/community?tab=meetups" className="text-xs text-accent font-medium hover:underline">
          See all
        </a>
      </div>
      {posts.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing planned yet.</p>
      ) : (
        <ul className="space-y-3">
          {posts.slice(0, 3).map((p) => (
            <li key={p.id}>
              <a href={`#/community?post=${p.id}`} className="flex gap-3 items-center group">
                <DateTile iso={p.meetup.startsAt} size="sm" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-foreground leading-snug group-hover:underline">{p.title}</span>
                  <span className="block text-[11px] text-muted-foreground truncate">{p.meetup.placeName}</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                    {p.meetup.myRsvp === "going" ? <span className="text-accent font-medium">You're going</span> : `${p.meetup.goingCount} going`}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {onPlan && (
        <button type="button" onClick={onPlan} className={`${secondaryButton} w-full mt-3 !py-1.5 !text-xs`}>
          <CalendarPlus className="w-3.5 h-3.5" /> Plan a meetup
        </button>
      )}
    </section>
  );
}

// ---------- Planning a meetup ----------

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toIso = (date: string, time: string) => (date && time ? new Date(`${date}T${time}`).toISOString() : "");

export function MeetupForm({ edit, authorName, onClose, onSave }: { edit?: MeetupPost; authorName: string; onClose: () => void; onSave: (m: NewMeetup) => Promise<void> }) {
  // A new meetup defaults to next Saturday at 10.
  const start = edit ? new Date(edit.meetup.startsAt) : (() => {
    const d = new Date();
    d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
    d.setHours(10, 0, 0, 0);
    return d;
  })();
  const end = edit?.meetup.endsAt ? new Date(edit.meetup.endsAt) : edit ? null : new Date(start.getTime() + 2 * 3600000);
  const [f, setF] = useState({
    title: edit?.title ?? "",
    body: edit && edit.body.trim() !== edit.title.trim() ? edit.body : "",
    date: localDate(start),
    time: localTime(start),
    endTime: end ? localTime(end) : "",
    placeName: edit?.meetup.placeName ?? "",
    address: edit?.meetup.address ?? "",
    capacity: edit?.meetup.capacity ? String(edit.meetup.capacity) : "",
  });
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => setProblem(null), [f]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const build = (): NewMeetup => {
    const startsAt = toIso(f.date, f.time);
    let endsAt = f.endTime ? toIso(f.date, f.endTime) : undefined;
    // An end time earlier than the start means it runs past midnight.
    if (endsAt && startsAt && endsAt <= startsAt) endsAt = new Date(Date.parse(endsAt) + 86400000).toISOString();
    return { title: f.title, body: f.body, startsAt, endsAt, placeName: f.placeName, address: f.address, capacity: f.capacity ? Number(f.capacity) : undefined };
  };
  const submit = async () => {
    const m = build();
    const issue = meetupProblem(m, Date.now(), !!edit);
    if (issue) return setProblem(issue);
    setSaving(true);
    try {
      await onSave(m);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "The meetup didn't save.");
      setSaving(false);
    }
  };
  return (
    <Modal label={edit ? "Edit meetup" : "Plan a meetup"} onClose={onClose} maxWidth="max-w-lg">
      <ModalHeader
        title={edit ? "Edit meetup" : "Plan a meetup"}
        subtitle={edit ? "Everyone who RSVP'd sees the changes." : `Hosted by ${authorName}. It's posted to the group so people can RSVP and chat.`}
        onClose={onClose}
        icon={
          <span className="w-8 h-8 rounded-full bg-accent/15 text-accent flex items-center justify-center">
            <CalendarPlus className="w-4 h-4" />
          </span>
        }
      />
      <form
        className="p-5 space-y-4 overflow-y-auto"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="What's the plan?">
          <input className={inputClass} maxLength={LIMITS.title} value={f.title} onChange={set("title")} placeholder="e.g. Saturday thrift crawl + coffee" autoFocus />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Date">
            <input type="date" className={inputClass} value={f.date} min={edit ? undefined : localDate(new Date())} onChange={set("date")} required />
          </Field>
          <Field label="Starts">
            <input type="time" className={inputClass} value={f.time} onChange={set("time")} required />
          </Field>
          <Field label="Ends (optional)">
            <input type="time" className={inputClass} value={f.endTime} onChange={set("endTime")} />
          </Field>
        </div>
        <Field label="Where">
          <input className={inputClass} maxLength={MEETUP_LIMITS.place} value={f.placeName} onChange={set("placeName")} placeholder="e.g. Bean There Café, or Goodwill on 5th" />
        </Field>
        <Field label="Address or area (optional)">
          <input className={inputClass} maxLength={MEETUP_LIMITS.address} value={f.address} onChange={set("address")} placeholder="Street and town, so people can get directions" />
        </Field>
        <p className="-mt-2 text-[11px] text-muted-foreground">Meeting at home? Put just the neighborhood here and share the address in the comments with people who are going.</p>
        <Field label="Spots (optional)">
          <input type="number" inputMode="numeric" min={2} max={MEETUP_LIMITS.capacity} className={`${inputClass} max-w-32`} value={f.capacity} onChange={set("capacity")} placeholder="No limit" />
        </Field>
        <Field label="Details (optional)">
          <textarea
            className={`${inputClass} min-h-24`}
            maxLength={LIMITS.body}
            value={f.body}
            onChange={set("body")}
            placeholder="What to bring, where to park, who it's for. Hubbies, partners and friends welcome?"
          />
        </Field>
        {problem && <p className="text-xs text-destructive">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryButton} disabled={saving}>
            {saving ? "Saving…" : edit ? "Save changes" : "Post meetup"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
