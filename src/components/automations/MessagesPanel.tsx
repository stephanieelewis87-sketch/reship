import { useEffect, useMemo, useState } from "react";
import { Ban, Check, Copy, ExternalLink, MessageCircle, Plus, Puzzle, ShieldCheck, Trash2 } from "lucide-react";
import type { Platform } from "@/lib/types";
import type { useReshipData } from "@/lib/useReshipData";
import {
  CONTEXT_LABEL,
  DEFAULT_TEMPLATES,
  MESSAGE_RULES,
  MESSAGING_PLATFORMS,
  contactKey,
  fillTemplate,
  isAllowed,
  messagePageUrl,
  messagingOf,
  orderItemText,
  pastBuyers,
  promoCheck,
  recordContact,
  suggestedTemplateId,
  templatesFor,
  whereToPost,
  type Allowed,
  type MessageContext,
  type MessageRule,
  type MessageTemplate,
  type MessagingSettings,
  type PastBuyer,
} from "@/lib/messaging";
import { PlatformIcon, inputClass, primaryButton, secondaryButton, selectClass } from "../ui";

type Data = ReturnType<typeof useReshipData>;

const contextsFor = (p: Platform): MessageContext[] => (p === "Poshmark" ? ["bundle", "pastBuyer", "potentialBuyer"] : ["pastBuyer", "potentialBuyer"]);

const ALLOWED_BADGE: Record<Allowed, { text: string; className: string }> = {
  yes: { text: "Allowed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  limited: { text: "Allowed, with limits", className: "bg-amber-50 text-amber-800 border-amber-200" },
  no: { text: "Not allowed", className: "bg-muted text-muted-foreground border-border" },
};

// Buyer messages: SellSync writes the message from a template, copies it and opens the right page.
// The seller pastes it and presses Send on the marketplace, which keeps every marketplace's
// no-bots rule.
export function MessagesPanel({ data }: { data: Data }) {
  const messaging = messagingOf(data.settings.messaging);
  const save = (m: MessagingSettings) => data.saveSettings({ ...data.settings, messaging: m });
  const [platform, setPlatform] = useState<Platform>(MESSAGING_PLATFORMS.includes(data.settings.primaryMarketplace) ? data.settings.primaryMarketplace : "Poshmark");
  const [context, setContext] = useState<MessageContext>(platform === "Poshmark" ? "bundle" : "pastBuyer");
  const rule = MESSAGE_RULES[platform][context];

  const pick = (p: Platform) => {
    setPlatform(p);
    if (!contextsFor(p).includes(context)) setContext("pastBuyer");
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground flex gap-2">
        <ShieldCheck className="w-4 h-4 shrink-0 text-accent" />
        <span>
          SellSync writes the message, copies it and opens the page for you. You paste it and press Send yourself, because every marketplace here bans bots that comment or message for you. With the SellSync extension, a Templates button also appears in Poshmark and Depop comment boxes.
        </span>
      </p>
      <div className="flex gap-1.5 overflow-x-auto max-w-full">
        {MESSAGING_PLATFORMS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => pick(p)}
            aria-pressed={platform === p}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs whitespace-nowrap ${platform === p ? "border-accent bg-rose-50/60 text-accent" : "border-border text-muted-foreground hover:bg-muted"}`}
          >
            <PlatformIcon platform={p} /> {p}
          </button>
        ))}
      </div>
      <div role="tablist" className="flex gap-1 border-b border-border overflow-x-auto">
        {contextsFor(platform).map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={context === c}
            onClick={() => setContext(c)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${context === c ? "border-accent text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {CONTEXT_LABEL[c]}
            {!isAllowed(platform, c) && <span className="ml-1.5 text-[11px] text-muted-foreground">(not allowed)</span>}
          </button>
        ))}
      </div>
      <RuleNote platform={platform} rule={rule} />
      {isAllowed(platform, context) && (
        <>
          <Composer key={`${platform}-${context}`} data={data} platform={platform} context={context} messaging={messaging} save={save} />
          <TemplateEditor key={`t-${platform}-${context}`} platform={platform} context={context} messaging={messaging} save={save} />
        </>
      )}
    </div>
  );
}

function RuleNote({ platform, rule }: { platform: Platform; rule: MessageRule }) {
  const badge = ALLOWED_BADGE[rule.allowed];
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-display font-semibold text-foreground">What {platform} allows</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${badge.className}`}>{badge.text}</span>
      </div>
      <p className="text-muted-foreground text-[13px]">{rule.text}</p>
      {rule.source && (
        <a href={rule.source.url} target="_blank" rel="noreferrer" className="text-[12px] text-accent inline-flex items-center gap-1">
          {rule.source.label} <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

function Composer({
  data,
  platform,
  context,
  messaging,
  save,
}: {
  data: Data;
  platform: Platform;
  context: MessageContext;
  messaging: MessagingSettings;
  save: (m: MessagingSettings) => void;
}) {
  const templates = templatesFor(messaging.templates, platform, context);
  const buyers = useMemo(() => (context === "pastBuyer" ? pastBuyers(data.orders, platform) : []), [data.orders, platform, context]);
  const listed = useMemo(
    () => data.inventory.filter((i) => i.listings.some((l) => l.platform === platform && l.status === "active")).map((i) => i.title),
    [data.inventory, platform],
  );
  const [recipient, setRecipient] = useState("");
  const [orderId, setOrderId] = useState<string | undefined>();
  const [item, setItem] = useState("");
  const [discount, setDiscount] = useState("10%");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [text, setText] = useState("");
  const [edited, setEdited] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const template = templates.find((t) => t.id === templateId) ?? templates[0];
  const key = recipient.trim() ? contactKey(platform, recipient) : "";
  const record = key ? messaging.contacts[key] : undefined;
  const promo = template?.promo ? promoCheck(record) : { ok: true };
  const blocked = !!record?.optOut;

  useEffect(() => {
    if (!edited) setText(template ? fillTemplate(template.text, { buyer: recipient, item, discount, seller: data.settings.displayName }) : "");
    setDone(null);
  }, [template, recipient, item, discount, edited, data.settings.displayName]);

  const choose = (b: PastBuyer) => {
    setRecipient(b.buyer);
    setOrderId(b.lastOrder.orderId);
    setItem(orderItemText(b.lastOrder));
    const suggested = suggestedTemplateId(b.lastOrder);
    if (templates.some((t) => t.id === suggested)) setTemplateId(suggested);
    setEdited(false);
  };

  const send = async (open: boolean) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard can be blocked; the message is still on screen to copy by hand.
    }
    if (open) {
      const url = messagePageUrl(platform, context, { buyer: recipient, orderId });
      if (url) window.open(url, "_blank", "noopener");
    }
    if (key) save({ ...messaging, contacts: recordContact(messaging.contacts, key, !!template?.promo) });
    setDone(open ? `Copied. ${whereToPost(platform, context)}` : "Copied.");
  };

  const setOptOut = (optOut: boolean) => {
    if (!key) return;
    const prev = messaging.contacts[key];
    save({ ...messaging, contacts: { ...messaging.contacts, [key]: { ...prev, count: prev?.count ?? 0, lastAt: prev?.lastAt ?? "", optOut } } });
  };

  const shownBuyers = buyers.filter((b) => !search.trim() || b.buyer.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 50);
  const who = context === "bundle" ? "Shopper's username" : context === "pastBuyer" ? "Buyer" : "Their username";
  const what = context === "bundle" ? "What's in the bundle" : "Item";

  return (
    <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4">
      {context === "pastBuyer" ? (
        <section className="rounded-xl border border-border bg-card p-4 space-y-2 min-w-0">
          <h2 className="font-display text-sm font-semibold text-foreground">Your {platform} buyers</h2>
          {buyers.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No {platform} orders yet. Buyers show up here once their orders sync or are imported.</p>
          ) : (
            <>
              <input className={inputClass} placeholder="Search buyers" value={search} onChange={(e) => setSearch(e.target.value)} />
              <ul className="divide-y divide-border max-h-80 overflow-y-auto -mx-1">
                {shownBuyers.map((b) => {
                  const r = messaging.contacts[b.key];
                  return (
                    <li key={b.key}>
                      <button
                        type="button"
                        onClick={() => choose(b)}
                        className={`w-full text-left px-1 py-2 text-[13px] hover:bg-muted rounded-md ${recipient && contactKey(platform, recipient) === b.key ? "bg-muted" : ""}`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="font-medium text-foreground truncate">{b.buyer}</span>
                          {r?.optOut && <Ban className="w-3.5 h-3.5 text-muted-foreground" aria-label="Don't contact" />}
                          <span className="ml-auto text-[11px] text-muted-foreground whitespace-nowrap">
                            {b.orders.length} order{b.orders.length === 1 ? "" : "s"}
                          </span>
                        </span>
                        <span className="block text-[12px] text-muted-foreground truncate">
                          {b.lastOrder.date} · {orderItemText(b.lastOrder)}
                          {r?.lastAt ? ` · messaged ${r.lastAt.slice(0, 10)}` : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      ) : (
        <section className="rounded-xl border border-border bg-card p-4 space-y-3 min-w-0">
          <h2 className="font-display text-sm font-semibold text-foreground">{context === "bundle" ? "Who bundled" : "Who's interested"}</h2>
          <label className="block text-[12px] text-muted-foreground space-y-1">
            <span>{who}</span>
            <input className={inputClass} value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="e.g. closetqueen" />
          </label>
          <label className="block text-[12px] text-muted-foreground space-y-1">
            <span>{what}</span>
            <input className={inputClass} list={`items-${platform}`} value={item} onChange={(e) => setItem(e.target.value)} placeholder="e.g. Levi's 501 jeans" />
            <datalist id={`items-${platform}`}>
              {listed.slice(0, 200).map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          {context === "bundle" && (
            <p className="text-[12px] text-muted-foreground">Find shoppers on Poshmark under My Shoppers. Each one there has a bundle you can comment on.</p>
          )}
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-4 space-y-3 min-w-0">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-accent" />
          <h2 className="font-display text-sm font-semibold text-foreground">{context === "bundle" ? "Bundle comment" : "Message"}</h2>
        </div>
        {templates.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No templates for this yet. Add one below.</p>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <select
              className={selectClass}
              aria-label="Template"
              value={template?.id}
              onChange={(e) => {
                setTemplateId(e.target.value);
                setEdited(false);
              }}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.promo ? " (new items)" : ""}
                </option>
              ))}
            </select>
            {/\{discount\}/.test(template?.text ?? "") && (
              <input className={`${selectClass} w-20`} aria-label="Discount" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            )}
          </div>
        )}
        <textarea
          className={`${inputClass} min-h-28`}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setEdited(true);
          }}
          aria-label="Message"
        />
        {edited && (
          <button type="button" className="text-[12px] text-accent" onClick={() => setEdited(false)}>
            Start over from the template
          </button>
        )}
        {blocked && <p className="text-[12px] text-amber-800">You marked {recipient} as don't contact.</p>}
        {!blocked && !promo.ok && <p className="text-[12px] text-amber-800">{promo.reason}</p>}
        <div className="flex gap-2 flex-wrap">
          <button type="button" className={primaryButton} disabled={!text.trim() || blocked || !promo.ok} onClick={() => send(true)}>
            <ExternalLink className="w-4 h-4" /> Copy and open {platform}
          </button>
          <button type="button" className={secondaryButton} disabled={!text.trim() || blocked || !promo.ok} onClick={() => send(false)}>
            <Copy className="w-4 h-4" /> Copy
          </button>
        </div>
        {done && (
          <p className="text-[12px] text-emerald-700 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" /> {done}
          </p>
        )}
        {key && (
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <input type="checkbox" checked={blocked} onChange={(e) => setOptOut(e.target.checked)} />
            Don't contact {recipient.trim()} again (for example, if they asked you to stop)
          </label>
        )}
        {record?.lastAt && (
          <p className="text-[11px] text-muted-foreground">
            Messages opened for {recipient.trim()}: {record.count}, last on {record.lastAt.slice(0, 10)}.
          </p>
        )}
      </section>
    </div>
  );
}

function TemplateEditor({
  platform,
  context,
  messaging,
  save,
}: {
  platform: Platform;
  context: MessageContext;
  messaging: MessagingSettings;
  save: (m: MessagingSettings) => void;
}) {
  const [draft, setDraft] = useState<MessageTemplate[]>(messaging.templates);
  const [dirty, setDirty] = useState(false);
  const shown = templatesFor(draft, platform, context);
  const update = (id: string, patch: Partial<MessageTemplate>) => {
    setDraft(draft.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    setDirty(true);
  };

  return (
    <details className="group rounded-xl border border-border bg-card px-4 py-3">
      <summary className="cursor-pointer list-none font-display text-sm font-semibold text-foreground flex items-center gap-1.5">
        Edit {CONTEXT_LABEL[context].toLowerCase()} templates
        <span className="ml-auto text-[12px] font-sans font-normal text-muted-foreground group-open:hidden">Show</span>
      </summary>
      <div className="space-y-3 mt-3">
        <p className="text-[12px] text-muted-foreground">
          Use {"{buyer}"}, {"{item}"}, {"{discount}"} and {"{seller}"}; SellSync fills them in. Templates are shared by every marketplace that allows this kind of message, unless you pick some.
        </p>
        {shown.map((t) => (
          <div key={t.id} className="space-y-1.5 border-t border-border pt-3 first:border-0 first:pt-0">
            <div className="flex gap-2">
              <input className={inputClass} aria-label="Template name" value={t.name} onChange={(e) => update(t.id, { name: e.target.value })} />
              <button
                type="button"
                aria-label={`Delete ${t.name}`}
                className="p-2 rounded-md text-muted-foreground hover:bg-muted"
                onClick={() => {
                  setDraft(draft.filter((x) => x.id !== t.id));
                  setDirty(true);
                }}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <textarea className={`${inputClass} min-h-20`} aria-label="Template text" value={t.text} onChange={(e) => update(t.id, { text: e.target.value })} />
            <div className="flex gap-3 flex-wrap text-[12px] text-muted-foreground">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={!!t.platforms?.length}
                  onChange={(e) => update(t.id, { platforms: e.target.checked ? [platform] : undefined })}
                />
                Only on {t.platforms?.length ? t.platforms.join(", ") : platform}
              </label>
              {context === "pastBuyer" && (
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={!!t.promo} onChange={(e) => update(t.id, { promo: e.target.checked })} />
                  About new items or a sale (once a month per buyer)
                </label>
              )}
            </div>
          </div>
        ))}
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            className={secondaryButton}
            onClick={() => {
              setDraft([...draft, { id: `tpl-${Date.now().toString(36)}`, name: "New template", context, text: "Hi {buyer}! " }]);
              setDirty(true);
            }}
          >
            <Plus className="w-4 h-4" /> Add template
          </button>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => {
              setDraft([...draft.filter((t) => t.context !== context), ...DEFAULT_TEMPLATES.filter((t) => t.context === context)]);
              setDirty(true);
            }}
          >
            Reset these to the defaults
          </button>
          <button
            type="button"
            className={primaryButton}
            disabled={!dirty}
            onClick={() => {
              save({ ...messaging, templates: draft });
              setDirty(false);
            }}
          >
            {dirty ? "Save templates" : "Saved"}
          </button>
        </div>
        <p className="text-[12px] text-muted-foreground flex gap-1.5">
          <Puzzle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> The extension picks up saved templates the next time you open a comment box.
        </p>
      </div>
    </details>
  );
}
