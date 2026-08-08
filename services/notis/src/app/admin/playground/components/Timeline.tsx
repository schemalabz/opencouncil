"use client";

import { useEffect, useRef, useState } from "react";
import { AlarmClock, FileText, ListTodo, MessageCircle, Moon } from "lucide-react";
import { MeetingDetails, fetchMeetingDetails } from "../api";
import { QueueItem } from "../types";

interface Props {
  queue: QueueItem[];
  cityMeta?: Record<string, { name: string; logo?: string | null }>;
  selectedId?: string;
  busyItemId?: string;
  onSelect(id: string): void;
}

function isMeetingEvent(
  item: QueueItem,
): item is QueueItem & { event: Extract<QueueItem["event"], { cityId: string }> } {
  return item.event.type === "agenda_processed" || item.event.type === "meeting_summarized";
}

function icon(item: QueueItem) {
  switch (item.event.type) {
    case "agenda_processed":
      return <ListTodo className="h-3.5 w-3.5" />;
    case "meeting_summarized":
      return <FileText className="h-3.5 w-3.5" />;
    case "user_message":
      return <MessageCircle className="h-3.5 w-3.5" />;
    case "scheduled":
      return <AlarmClock className="h-3.5 w-3.5" />;
    case "heartbeat":
      return <Moon className="h-3.5 w-3.5" />;
  }
}

function nodeClasses(item: QueueItem, isNext: boolean, isSelected: boolean, isBusy: boolean): string {
  const base =
    "relative z-10 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 transition-all";
  const ring = isSelected ? " ring-2 ring-orange ring-offset-2 ring-offset-background" : "";
  if (isBusy) return `${base} animate-pulse border-orange bg-orange text-white${ring}`;
  if (item.status === "skipped")
    return `${base} border-dashed border-muted-foreground/40 bg-background text-muted-foreground/50 opacity-60${ring}`;
  if (item.status === "done" && item.outcome?.decision === "send")
    return `${base} border-orange bg-orange text-white${ring}`;
  if (item.status === "done")
    return `${base} border-muted-foreground/30 bg-muted text-muted-foreground${ring}`;
  if (isNext) return `${base} border-orange bg-background text-orange animate-pulse${ring}`;
  return `${base} border-muted-foreground/30 bg-background text-muted-foreground/60${ring}`;
}

interface HoverState {
  item: QueueItem;
  x: number;
  y: number;
}

export function Timeline({ queue, cityMeta, selectedId, busyItemId, onSelect }: Props) {
  const nextId = queue.find((q) => q.status === "pending")?.id;
  const nextRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [details, setDetails] = useState<Record<string, MeetingDetails | "loading">>({});
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    nextRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [nextId]);

  function beginHover(item: QueueItem, el: HTMLElement) {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      const rect = el.getBoundingClientRect();
      // card is w-72 (288px) and centered on x — clamp so it never clips the viewport
      const half = 288 / 2 + 8;
      const x = Math.min(Math.max(rect.left + rect.width / 2, half), window.innerWidth - half);
      setHover({ item, x, y: rect.bottom + 6 });
      if (isMeetingEvent(item)) {
        const key = `${item.event.cityId}:${item.event.meetingId}`;
        if (!details[key]) {
          setDetails((d) => ({ ...d, [key]: "loading" }));
          fetchMeetingDetails(item.event.cityId, item.event.meetingId)
            .then((md) => setDetails((d) => ({ ...d, [key]: md })))
            .catch(() => setDetails((d) => ({ ...d, [key]: { topSubjects: [] } })));
        }
      }
    }, 200);
  }

  function endHover() {
    clearTimeout(hoverTimer.current);
    setHover(null);
  }

  let lastMonth = "";

  return (
    <div className="overflow-x-auto border-b bg-muted/30" onMouseLeave={endHover}>
      <div className="relative flex min-w-max items-start gap-0 px-6 py-3">
        {/* connecting line through the node centers: py-3 (12px) + month row (12px) + half node (16px) */}
        <div className="absolute left-0 right-0 top-[40px] h-0.5 bg-border" />
        {queue.map((item) => {
          const date = new Date(item.event.at);
          const month = date.toLocaleDateString("el-GR", { month: "short" });
          const showMonth = month !== lastMonth;
          lastMonth = month;
          const isNext = item.id === nextId;
          const messages = item.outcome?.messages.length ?? 0;
          const logo = isMeetingEvent(item) ? cityMeta?.[item.event.cityId]?.logo : undefined;
          return (
            <div
              key={item.id}
              ref={isNext ? nextRef : undefined}
              className="flex w-[64px] shrink-0 flex-col items-center"
            >
              <span className="h-3 text-[10px] font-medium uppercase text-muted-foreground">
                {showMonth ? month : ""}
              </span>
              <button
                onClick={() => onSelect(item.id)}
                onMouseEnter={(e) => beginHover(item, e.currentTarget)}
                onMouseLeave={endHover}
                className={nodeClasses(item, isNext, item.id === selectedId, item.id === busyItemId)}
              >
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="" className="h-full w-full object-contain p-0.5" />
                ) : (
                  icon(item)
                )}
                {messages > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#25d366] px-0.5 text-[9px] font-bold text-white">
                    {messages}
                  </span>
                )}
              </button>
              {logo && (
                <span
                  className={`pointer-events-none absolute top-[30px] z-20 ml-5 flex h-4 w-4 items-center justify-center rounded-full border bg-background ${
                    item.event.type === "agenda_processed" ? "text-muted-foreground" : "text-foreground"
                  }`}
                >
                  {item.event.type === "agenda_processed" ? (
                    <ListTodo className="h-2.5 w-2.5" />
                  ) : (
                    <FileText className="h-2.5 w-2.5" />
                  )}
                </span>
              )}
              <span
                className={`mt-1 text-[10px] tabular-nums ${isNext ? "font-semibold text-orange" : "text-muted-foreground"}`}
              >
                {date.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {hover && <HoverCard hover={hover} cityMeta={cityMeta} details={details} />}
    </div>
  );
}

function HoverCard({
  hover,
  cityMeta,
  details,
}: {
  hover: HoverState;
  cityMeta?: Record<string, { name: string; logo?: string | null }>;
  details: Record<string, MeetingDetails | "loading">;
}) {
  const { item } = hover;
  const e = item.event;
  const meeting = isMeetingEvent(item) ? item.event : null;
  const city = meeting ? cityMeta?.[meeting.cityId] : undefined;
  const md = meeting ? details[`${meeting.cityId}:${meeting.meetingId}`] : undefined;
  const when = new Date(e.at).toLocaleDateString("el-GR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div
      className="fixed z-50 w-72 -translate-x-1/2 border bg-popover p-3 text-sm shadow-lg"
      style={{ left: hover.x, top: hover.y }}
    >
      {meeting ? (
        <>
          <div className="flex items-center gap-2.5">
            {city?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={city.logo} alt="" className="h-8 w-8 shrink-0 object-contain" />
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs">
                {city?.name?.[0] ?? "•"}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate font-medium leading-tight">{meeting.meetingName}</p>
              <p className="text-xs text-muted-foreground">
                {city?.name} · {when}
              </p>
            </div>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {e.type === "agenda_processed" ? "Ατζέντα πριν τη συνεδρίαση" : "Πρακτικά μετά τη συνεδρίαση"}
            {md && md !== "loading" && md.adminBody ? ` · ${md.adminBody}` : ""}
          </p>
          {md === "loading" && (
            <p className="mt-2 text-xs text-muted-foreground/70">Φόρτωση θεμάτων…</p>
          )}
          {md && md !== "loading" && md.topSubjects.length > 0 && (
            <div className="mt-2 space-y-1 border-t pt-2">
              {md.topSubjects.map((s) => (
                <p key={s.name} className="flex justify-between gap-2 text-xs">
                  <span className="truncate">{s.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{s.minutes}′</span>
                </p>
              ))}
            </div>
          )}
          {item.outcome && (
            <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
              {item.outcome.decision === "send"
                ? `✉ Έστειλε ${item.outcome.messages.length}`
                : "🤫 Σιωπή"}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="font-medium leading-tight">
            {e.type === "user_message"
              ? "Μήνυμα χρήστη"
              : e.type === "scheduled"
                ? "Προγραμματισμένο follow-up"
                : "Heartbeat"}
          </p>
          <p className="text-xs text-muted-foreground">{when}</p>
          {e.type === "user_message" && (
            <p className="mt-1.5 text-xs">«{e.text.slice(0, 120)}»</p>
          )}
          {e.type === "scheduled" && (
            <p className="mt-1.5 text-xs text-muted-foreground">{e.reason.slice(0, 140)}</p>
          )}
        </>
      )}
    </div>
  );
}
