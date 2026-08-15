"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCheck,
  ExternalLink,
  FastForward,
  Send,
  SkipForward,
  Square,
  StepForward,
} from "lucide-react";
/* eslint-disable @next/next/no-img-element */
import { Button } from "@opencouncil/ui/button";
import { RenderedTemplate, introTemplateFor, renderTemplate } from "@/agent/templates";
import { fmtDateChip, fmtTime } from "../_lib/format";
import { Origin, WakeRecord } from "../_lib/records";
import { WA } from "../_lib/whatsapp";

/** Simulator affordances — omit them for the read-only conversation viewer. */
export interface SimControls {
  busy: boolean;
  /** A run-until-he-texts loop is in flight. */
  autoRun: boolean;
  onStep(): void;
  onSkip(): void;
  onRunUntilSend(): void;
  onStopAutoRun(): void;
  onUserMessage(text: string): void;
}

interface Props {
  records: WakeRecord[];
  clock: string;
  origin: Origin;
  startAt: string;
  selectedId?: string;
  /** The record currently being run — its user bubble renders instantly. */
  busyItemId?: string;
  onSelect(id: string): void;
  sim?: SimControls;
}

/* WhatsApp visual constants (palette lives in ../_lib/whatsapp) */
const BG = WA.chatBg;
const OUT = WA.outBubble; // user bubbles (right)
const PATTERN =
  "radial-gradient(circle at 1px 1px, rgba(60,50,30,0.055) 1px, transparent 0)";

function eventCaption(item: WakeRecord): string {
  const e = item.event;
  switch (e.type) {
    case "agenda_processed":
      return `πριν τη συνεδρίαση · ${e.meetingName}`;
    case "meeting_summarized":
      return `${e.meetingName}`;
    case "scheduled":
      return "follow-up";
    default:
      return "";
  }
}

/* ---- links: WhatsApp-style linkify + OG preview card ---- */

const URL_RE = /(https?:\/\/[^\s»«]+)/g;

function firstUrl(text: string): string | undefined {
  return text.match(URL_RE)?.[0];
}

/** URLs become tappable, WhatsApp-blue, and don't trigger bubble selection. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="break-all text-[#027eb5] underline"
          >
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

interface OgData {
  title?: string;
  description?: string;
  image?: string;
  host?: string;
}

const ogCache = new Map<string, OgData | null>();

/** The grey preview card WhatsApp puts above a message with a link. */
function LinkPreview({ url }: { url: string }) {
  const [og, setOg] = useState<OgData | null | undefined>(ogCache.get(url));

  useEffect(() => {
    if (ogCache.has(url)) return;
    let alive = true;
    fetch(`/api/proxy/og?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? (r.json() as Promise<OgData>) : null))
      .then((data) => {
        ogCache.set(url, data);
        if (alive) setOg(data);
      })
      .catch(() => {
        ogCache.set(url, null);
        if (alive) setOg(null);
      });
    return () => {
      alive = false;
    };
  }, [url]);

  if (!og?.title && !og?.image) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="mb-1 block overflow-hidden rounded-md bg-[#f5f6f6] no-underline"
    >
      {og.image && (
        // OG images are 1200x630 — render at their natural aspect so the
        // whole image shows instead of a cropped strip.
        <img src={og.image} alt="" className="aspect-[1200/630] w-full bg-muted object-cover" />
      )}
      <div className="px-2.5 py-1.5">
        {og.title && (
          <p className="line-clamp-2 text-[13px] font-medium leading-tight text-[#111b21]">
            {og.title}
          </p>
        )}
        {og.description && (
          <p className="line-clamp-2 text-[12px] leading-snug text-[#667781]">{og.description}</p>
        )}
        <p className="mt-0.5 text-[11px] text-[#8696a0]">{og.host ?? new URL(url).hostname}</p>
      </div>
    </a>
  );
}

/**
 * WhatsApp status ticks for the user's own messages, following Bird/WhatsApp
 * mechanics: Notis marks the inbound message as read when its wake starts
 * (Bird mark-as-read), so a live message animates sent ✓ → delivered ✓✓ →
 * read (blue) ✓✓; historical messages are simply read.
 */
function Ticks({ live }: { live: boolean }) {
  const [stage, setStage] = useState(live ? 0 : 2);
  useEffect(() => {
    if (!live) {
      // The run can end (or error out) before the animation does — the prop
      // flips to "read", and without this the tick froze grey forever.
      setStage(2);
      return;
    }
    const delivered = setTimeout(() => setStage(1), 500);
    const read = setTimeout(() => setStage(2), 1400);
    return () => {
      clearTimeout(delivered);
      clearTimeout(read);
    };
  }, [live]);
  const Icon = stage === 0 ? Check : CheckCheck;
  return (
    <Icon
      className="ml-0.5 inline h-3.5 w-3.5 align-text-bottom"
      style={{ color: stage === 2 ? "#53bdeb" : "#8696a0" }}
    />
  );
}

function Tail({ side }: { side: "in" | "out" }) {
  return (
    <svg
      viewBox="0 0 8 13"
      width="8"
      height="13"
      className={`absolute top-0 ${side === "in" ? "-left-2" : "-right-2 -scale-x-100"}`}
    >
      <path d="M8 0H0c3 1 5.5 3.5 5.5 7L8 13V0Z" fill={side === "in" ? "#ffffff" : OUT} />
    </svg>
  );
}

function Bubble({
  side,
  time,
  caption,
  selected,
  first,
  onClick,
  text,
  ticks,
}: {
  side: "in" | "out";
  time: string;
  caption?: string;
  selected?: boolean;
  first: boolean;
  onClick?: () => void;
  text: string;
  /** Status ticks (out bubbles only): "live" animates the read progression. */
  ticks?: "live" | "read";
}) {
  const url = side === "in" ? firstUrl(text) : undefined;
  return (
    <div className={`flex ${side === "out" ? "justify-end" : "justify-start"} px-4`}>
      <div
        onClick={onClick}
        className={`relative max-w-[75%] cursor-pointer px-3 pb-2 pt-1.5 text-[14.2px] leading-[19px] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] ${
          side === "in" ? "rounded-lg rounded-tl-none bg-white" : "rounded-lg rounded-tr-none"
        } ${selected ? "ring-2 ring-orange" : ""}`}
        style={side === "out" ? { backgroundColor: OUT } : undefined}
      >
        {first && <Tail side={side} />}
        {caption && (
          <p className="mb-0.5 text-[11px] font-medium text-[#e5651a]">{caption}</p>
        )}
        {url && <LinkPreview url={url} />}
        <span className="whitespace-pre-wrap break-words">
          <Linkified text={text} />
        </span>
        <span className="float-right ml-2 mt-2 select-none text-[11px] leading-none text-[#667781]">
          {time}
          {side === "out" && ticks && <Ticks live={ticks === "live"} />}
        </span>
      </div>
    </div>
  );
}

function TemplateBubble({
  rendered,
  time,
  first,
  selected,
  onClick,
  onQuickReply,
  busy,
}: {
  rendered: RenderedTemplate;
  time: string;
  first: boolean;
  selected?: boolean;
  onClick?: () => void;
  onQuickReply?: (label: string) => void;
  busy?: boolean;
}) {
  const url = firstUrl(rendered.body);
  return (
    <div className="flex justify-start px-4">
      <div
        onClick={onClick}
        className={`relative max-w-[75%] cursor-pointer rounded-lg rounded-tl-none bg-white pb-1 pt-1.5 text-[14.2px] leading-[19px] text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] ${
          selected ? "ring-2 ring-orange" : ""
        }`}
      >
        {first && <Tail side="in" />}
        <div className="px-3">
          {url && <LinkPreview url={url} />}
          <span className="whitespace-pre-wrap break-words">
            <Linkified text={rendered.body} />
          </span>
          <p className="mt-1.5 text-[12px] text-[#8696a0]">{rendered.footer}</p>
          <span className="float-right ml-2 select-none text-[11px] leading-none text-[#667781]">
            {time}
          </span>
          <div className="clear-both" />
        </div>
        <div className="mt-1 border-t border-[#e9edef]">
          {rendered.buttons.map((b) => (
            <button
              key={b.label}
              // In the read-only viewer there is no onQuickReply: leave the
              // button inert-and-disabled instead of an enabled no-op that
              // also swallows bubble selection.
              disabled={busy || b.kind === "url" || !onQuickReply}
              onClick={(e) => {
                e.stopPropagation();
                if (b.kind === "quick_reply") onQuickReply?.(b.label);
              }}
              className="flex w-full items-center justify-center gap-1.5 border-b border-[#e9edef] py-2 text-[14px] font-medium text-[#00a5f4] last:border-b-0 disabled:opacity-90"
            >
              {b.kind === "url" && <ExternalLink className="h-3.5 w-3.5" />}
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SilenceChip({ item, selected, onClick }: { item: WakeRecord; selected: boolean; onClick(): void }) {
  return (
    <div className="flex justify-center px-4">
      <button
        onClick={onClick}
        title={item.outcome?.rationale}
        className={`max-w-[85%] truncate rounded-md bg-[#ffffffcc] px-3 py-1 text-[11px] text-[#54656f] shadow-sm ${
          selected ? "ring-2 ring-orange" : ""
        }`}
      >
        🤫 {eventCaption(item) || item.event.type} — ο Νότης δεν έγραψε
      </button>
    </div>
  );
}

/**
 * The composer owns its draft: typing must not re-render the whole thread
 * (every bubble, every renderTemplate, every LinkPreview) on each keystroke.
 */
function Composer({ disabled, onSend }: { disabled: boolean; onSend(text: string): void }) {
  const [draft, setDraft] = useState("");
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.trim()) return;
        onSend(draft.trim());
        setDraft("");
      }}
    >
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Γράψε ένα μήνυμα"
        disabled={disabled}
        className="h-10 flex-1 rounded-full bg-white px-4 text-sm text-[#111b21] placeholder:text-[#8696a0] focus:outline-none"
      />
      <button
        type="submit"
        disabled={disabled || !draft.trim()}
        aria-label="Στείλε"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25d366] text-white shadow disabled:opacity-40"
      >
        <Send className="h-4 w-4" />
      </button>
    </form>
  );
}

export function WhatsAppChat({
  records,
  clock,
  origin,
  startAt,
  selectedId,
  busyItemId,
  onSelect,
  sim,
}: Props) {
  const threadRef = useRef<HTMLDivElement>(null);
  const busy = sim?.busy ?? false;
  const autoRun = sim?.autoRun ?? false;
  // user messages render as soon as they're queued (before the run completes),
  // so the sent bubble appears immediately with the typing indicator below it
  // Pending records are invisible except the one actively running — that
  // keeps a just-sent user message visible instantly, while a rewind (which
  // returns records to pending without running them) clears their bubbles.
  const visible = records.filter((q) => q.status !== "pending" || q.id === busyItemId);
  // Mirror the page's ΣΤΟΠ gate: once a wake unsubscribed the reader, the
  // remaining proactive items are dead — the buttons must look it, not just
  // silently no-op. The composer stays live (inbound survives a ΣΤΟΠ).
  const stopped = records.some((r) => r.outcome?.unsubscribe);
  const next = stopped ? undefined : records.find((q) => q.status === "pending");
  const intro = renderTemplate(introTemplateFor(origin));
  const introAt = new Date(startAt).toISOString();

  // Scroll ONLY the thread container. Never scrollIntoView here: it walks and
  // scrolls every ancestor — including overflow-hidden page columns, which it
  // silently drags out of alignment.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [visible.length, busy]);

  // WhatsApp dismisses the typing indicator ~25s after mark-as-read if no
  // message has arrived (Bird rides the same mechanics) — the simulator
  // honors the cap so long wakes feel exactly as they would in production.
  const [typingExpired, setTypingExpired] = useState(false);
  useEffect(() => {
    if (!busy) {
      setTypingExpired(false);
      return;
    }
    const cap = setTimeout(() => setTypingExpired(true), 25_000);
    return () => clearTimeout(cap);
  }, [busy]);

  let lastDay = "";

  return (
    <div className="mx-auto flex h-full w-full max-w-[720px] flex-col overflow-hidden rounded-none shadow-xl md:rounded-xl">
      {/* header */}
      <header className="flex items-center gap-3 bg-[#f0f2f5] px-4 py-2.5">
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm">
          <img src="/logo.png" alt="" className="h-7 w-7 object-contain" />
        </div>
        <div className="leading-tight">
          <p className="text-[15px] font-medium text-[#111b21]">Νότης</p>
          {busy && !typingExpired && <p className="text-xs text-[#667781]">γράφει...</p>}
        </div>
        <span className="ml-auto text-xs tabular-nums text-[#667781]">
          🕐 {clock ? new Date(clock).toLocaleDateString("el-GR") : "—"}
        </span>
      </header>

      {/* thread */}
      <div
        ref={threadRef}
        className="flex-1 space-y-1.5 overflow-y-auto py-3"
        style={{ backgroundColor: BG, backgroundImage: PATTERN, backgroundSize: "14px 14px" }}
      >
        {/* enrollment: the origin-appropriate approved template opens the thread */}
        <div className="flex justify-center px-4 py-1">
          <span className="rounded-md bg-[#ffffffcc] px-3 py-1 text-[11px] font-medium text-[#54656f] shadow-sm">
            {fmtDateChip(introAt)}
          </span>
        </div>
        <TemplateBubble
          rendered={intro}
          time={fmtTime(introAt)}
          first
          busy={busy || autoRun}
          onQuickReply={sim?.onUserMessage}
        />
        {(() => {
          lastDay = fmtDateChip(introAt);
          return null;
        })()}
        {visible.map((item) => {
          const day = fmtDateChip(item.event.at);
          const chip = day !== lastDay;
          lastDay = day;
          const selected = selectedId === item.id;
          return (
            <div key={item.id} className="space-y-1.5">
              {chip && (
                <div className="flex justify-center px-4 py-1">
                  <span className="rounded-md bg-[#ffffffcc] px-3 py-1 text-[11px] font-medium text-[#54656f] shadow-sm">
                    {day}
                  </span>
                </div>
              )}
              {item.event.type === "user_message" && (
                <Bubble
                  side="out"
                  first
                  time={fmtTime(item.event.at)}
                  selected={selected}
                  onClick={() => onSelect(item.id)}
                  text={item.event.text}
                  ticks={item.id === busyItemId ? "live" : "read"}
                />
              )}
              {item.status === "skipped" && (
                <div className="flex justify-center px-4">
                  <span className="rounded-md bg-[#ffffff99] px-3 py-1 text-[11px] text-[#8696a0] shadow-sm">
                    ⏭ {eventCaption(item)} — παραλείφθηκε
                  </span>
                </div>
              )}
              {item.outcome?.decision === "silence" && (
                <SilenceChip item={item} selected={selected} onClick={() => onSelect(item.id)} />
              )}
              {item.outcome?.unsubscribe && (
                <div className="flex justify-center px-4">
                  <button
                    onClick={() => onSelect(item.id)}
                    title={item.outcome.unsubscribe.reason}
                    className={`rounded-md bg-[#fde8e8] px-3 py-1 text-[11px] font-medium text-[#b42318] shadow-sm ${
                      selected ? "ring-2 ring-orange" : ""
                    }`}
                  >
                    🛑 Ο Νότης σταμάτησε τις ειδοποιήσεις (unsubscribe)
                  </button>
                </div>
              )}
              {item.outcome?.messages.map((m, i) =>
                item.delivery?.mode === "template" ? (
                  <TemplateBubble
                    key={i}
                    rendered={renderTemplate(item.delivery.template, m)}
                    time={fmtTime(item.event.at)}
                    first={i === 0}
                    selected={selected}
                    busy={busy || autoRun}
                    onClick={() => onSelect(item.id)}
                    onQuickReply={sim?.onUserMessage}
                  />
                ) : (
                  <Bubble
                    key={i}
                    side="in"
                    first={i === 0}
                    time={fmtTime(item.event.at)}
                    caption={i === 0 ? eventCaption(item) || undefined : undefined}
                    selected={selected}
                    onClick={() => onSelect(item.id)}
                    text={m}
                  />
                ),
              )}
            </div>
          );
        })}
        {busy && !typingExpired && (
          <div className="flex justify-start px-4">
            <div className="relative rounded-lg rounded-tl-none bg-white px-4 py-3 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
              <Tail side="in" />
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#8696a0]"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* controls + composer — simulator only; the viewer is read-only */}
      {sim && (
      <div className="space-y-2 bg-[#f0f2f5] px-3 py-2">
        <div className="flex gap-2">
          <Button size="sm" onClick={sim?.onStep} disabled={busy || autoRun || !next} className="flex-1">
            <StepForward className="mr-1.5 h-3.5 w-3.5" />
            {busy ? "Ο Νότης σκέφτεται..." : "Επόμενο γεγονός"}
          </Button>
          {autoRun ? (
            <Button
              size="sm"
              variant="outline"
              onClick={sim?.onStopAutoRun}
              title="Σταμάτα μετά το τρέχον βήμα"
            >
              <Square className="mr-1.5 h-3.5 w-3.5" />
              Στοπ
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={sim?.onRunUntilSend}
              disabled={busy || !next}
              title="Τρέξε μέχρι να ξαναγράψει ο Νότης"
            >
              <FastForward className="mr-1.5 h-3.5 w-3.5" />
              Μέχρι το επόμενο μήνυμα
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={sim?.onSkip} disabled={busy || autoRun || !next}>
            <SkipForward className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Composer disabled={busy || autoRun} onSend={sim.onUserMessage} />
      </div>
      )}
    </div>
  );
}
