"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Send, SkipForward, StepForward } from "lucide-react";
import { Button } from "@opencouncil/ui/button";
import { RenderedTemplate, renderTemplate } from "@/agent/templates";
import { QueueItem } from "../types";

interface Props {
  queue: QueueItem[];
  clock: string;
  busy: boolean;
  origin: "transition" | "signup";
  startAt: string;
  selectedId?: string;
  onSelect(id: string): void;
  onStep(): void;
  onSkip(): void;
  onUserMessage(text: string): void;
}

/* WhatsApp visual constants */
const BG = "#efeae2";
const OUT = "#d9fdd3"; // user bubbles (right)
const PATTERN =
  "radial-gradient(circle at 1px 1px, rgba(60,50,30,0.055) 1px, transparent 0)";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDateChip(iso: string): string {
  return new Date(iso)
    .toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long" })
    .toUpperCase();
}

function eventCaption(item: QueueItem): string {
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
  children,
}: {
  side: "in" | "out";
  time: string;
  caption?: string;
  selected?: boolean;
  first: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
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
        <span className="whitespace-pre-wrap break-words">{children}</span>
        <span className="float-right ml-2 mt-2 select-none text-[11px] leading-none text-[#667781]">
          {time}
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
          <span className="whitespace-pre-wrap break-words">{rendered.body}</span>
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
              disabled={busy || b.kind === "url"}
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

function SilenceChip({ item, selected, onClick }: { item: QueueItem; selected: boolean; onClick(): void }) {
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

export function WhatsAppChat({
  queue,
  clock,
  busy,
  origin,
  startAt,
  selectedId,
  onSelect,
  onStep,
  onSkip,
  onUserMessage,
}: Props) {
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const done = queue.filter((q) => q.status !== "pending");
  const next = queue.find((q) => q.status === "pending");
  const intro = renderTemplate(origin === "transition" ? "demos_transition" : "demos_intro");
  const introAt = new Date(startAt).toISOString();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [done.length, busy]);

  let lastDay = "";

  return (
    <div className="mx-auto flex h-full w-full max-w-[720px] flex-col overflow-hidden rounded-none shadow-xl md:my-3 md:rounded-xl">
      {/* header */}
      <header className="flex items-center gap-3 bg-[#f0f2f5] px-4 py-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground font-relative text-lg text-background">
          Ν
        </div>
        <div className="leading-tight">
          <p className="text-[15px] font-medium text-[#111b21]">ο Νότης</p>
          <p className="text-xs text-[#667781]">
            {busy ? "γράφει..." : "από το OpenCouncil · σου γράφει μόνο όταν αξίζει"}
          </p>
        </div>
        <span className="ml-auto text-xs tabular-nums text-[#667781]">
          🕐 {clock ? new Date(clock).toLocaleDateString("el-GR") : "—"}
        </span>
      </header>

      {/* thread */}
      <div
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
          busy={busy}
          onQuickReply={onUserMessage}
        />
        {(() => {
          lastDay = fmtDateChip(introAt);
          return null;
        })()}
        {done.map((item) => {
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
                >
                  {item.event.text}
                </Bubble>
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
              {item.outcome?.messages.map((m, i) =>
                item.delivery?.mode === "template" ? (
                  <TemplateBubble
                    key={i}
                    rendered={renderTemplate(item.delivery.template, m)}
                    time={fmtTime(item.event.at)}
                    first={i === 0}
                    selected={selected}
                    busy={busy}
                    onClick={() => onSelect(item.id)}
                    onQuickReply={onUserMessage}
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
                  >
                    {m}
                  </Bubble>
                ),
              )}
            </div>
          );
        })}
        {busy && (
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
        <div ref={bottomRef} />
      </div>

      {/* controls + composer */}
      <div className="space-y-2 bg-[#f0f2f5] px-3 py-2">
        <div className="flex gap-2">
          <Button size="sm" onClick={onStep} disabled={busy || !next} className="flex-1">
            <StepForward className="mr-1.5 h-3.5 w-3.5" />
            {busy ? "Ο Νότης σκέφτεται..." : "Επόμενο γεγονός"}
          </Button>
          <Button size="sm" variant="outline" onClick={onSkip} disabled={busy || !next}>
            <SkipForward className="h-3.5 w-3.5" />
          </Button>
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            onUserMessage(draft.trim());
            setDraft("");
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Γράψε ένα μήνυμα"
            disabled={busy}
            className="h-10 flex-1 rounded-full bg-white px-4 text-sm text-[#111b21] placeholder:text-[#8696a0] focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label="Στείλε"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25d366] text-white shadow disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
