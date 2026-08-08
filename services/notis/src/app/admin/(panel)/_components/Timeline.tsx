"use client";

import { useEffect, useRef, useState } from "react";
import { AlarmClock, FileText, ListTodo, MessageCircle, Moon } from "lucide-react";
import { MeetingDetails, fetchMeetingDetails } from "../_lib/meetings";
import { CityMeta, WakeRecord } from "../_lib/records";

interface Props {
  records: WakeRecord[];
  cityMeta?: CityMeta;
  selectedId?: string;
  busyItemId?: string;
  onSelect(id: string): void;
}

function isMeetingEvent(
  item: WakeRecord,
): item is WakeRecord & { event: Extract<WakeRecord["event"], { cityId: string }> } {
  return item.event.type === "agenda_processed" || item.event.type === "meeting_summarized";
}

function icon(item: WakeRecord) {
  switch (item.event.type) {
    case "agenda_processed":
      return <ListTodo className="h-4 w-4" />;
    case "meeting_summarized":
      return <FileText className="h-4 w-4" />;
    case "user_message":
      return <MessageCircle className="h-4 w-4" />;
    case "scheduled":
      return <AlarmClock className="h-4 w-4" />;
    case "heartbeat":
      return <Moon className="h-4 w-4" />;
  }
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Δημοτικό Συμβούλιο / Επιτροπή / Κοινότητα → two-letter tag for the badge. */
function adminBodyTag(item: WakeRecord): "ΔΣ" | "ΔΕ" | "ΔΚ" | null {
  if (!isMeetingEvent(item)) return null;
  const text = normalize(item.event.adminBody || item.event.meetingName);
  if (text.includes("συμβουλιο")) return "ΔΣ";
  if (text.includes("επιτροπη")) return "ΔΕ";
  if (text.includes("κοινοτητ")) return "ΔΚ";
  return null;
}

/**
 * The circle itself: the city logo (or event icon) fills it; state reads
 * through the ring color and the logo treatment, never by hiding the logo.
 */
function circleClasses(item: WakeRecord, isNext: boolean, isSelected: boolean, isBusy: boolean): string {
  const base =
    "flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 bg-background transition-all";
  const ring = isSelected ? " ring-2 ring-orange ring-offset-2 ring-offset-background" : "";
  if (isBusy) return `${base} animate-pulse border-orange${ring}`;
  if (item.status === "skipped") return `${base} border-dashed border-muted-foreground/40${ring}`;
  if (item.status === "done" && item.outcome?.decision === "send")
    return `${base} border-orange${ring}`;
  if (item.status === "done") return `${base} border-muted-foreground/40${ring}`;
  if (isNext) return `${base} animate-pulse border-orange${ring}`;
  return `${base} border-muted-foreground/20${ring}`;
}

/**
 * Logo treatment: the played past stays vivid, the unplayed future is
 * grayscale (the whole future column also fades via wrapper opacity).
 */
function logoClasses(item: WakeRecord, isNext: boolean): string {
  if (item.status === "skipped") return "grayscale";
  if (item.status === "pending" && !isNext) return "grayscale";
  return "";
}

interface HoverState {
  item: WakeRecord;
  x: number;
  y: number;
}

export function Timeline({ records, cityMeta, selectedId, busyItemId, onSelect }: Props) {
  const nextId = records.find((q) => q.status === "pending")?.id;
  const nextRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [details, setDetails] = useState<Record<string, MeetingDetails | "loading">>({});
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Scroll ONLY the strip, horizontally. scrollIntoView would also scroll
  // ancestor containers vertically and knock the page column out of line.
  useEffect(() => {
    const strip = stripRef.current;
    const node = nextRef.current;
    if (!strip || !node) return;
    const left = node.offsetLeft + node.offsetWidth / 2 - strip.clientWidth / 2;
    strip.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [nextId]);

  function beginHover(item: WakeRecord, el: HTMLElement) {
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
    <div ref={stripRef} className="overflow-x-auto border-b bg-muted/30" onMouseLeave={endHover}>
      <div className="relative flex min-w-max items-start gap-0 px-6 py-3">
        {/* connecting line through the node centers: py-3 (12px) + month row (12px) + half node (28px) */}
        <div className="absolute left-0 right-0 top-[52px] h-0.5 bg-border" />
        {records.map((item) => {
          const date = new Date(item.event.at);
          const month = date.toLocaleDateString("el-GR", { month: "short" });
          const showMonth = month !== lastMonth;
          lastMonth = month;
          const isNext = item.id === nextId;
          const messages = item.outcome?.messages.length ?? 0;
          const logo = isMeetingEvent(item) ? cityMeta?.[item.event.cityId]?.logo : undefined;
          const bodyTag = adminBodyTag(item);
          const isUserMsg = item.event.type === "user_message";
          const isFuture = item.status === "pending" && !isNext;
          return (
            <div
              key={item.id}
              ref={isNext ? nextRef : undefined}
              className="flex w-[84px] shrink-0 flex-col items-center"
            >
              <span className="h-3 text-[10px] font-medium uppercase text-muted-foreground">
                {showMonth ? month : ""}
              </span>
              <button
                onClick={() => onSelect(item.id)}
                onMouseEnter={(e) => beginHover(item, e.currentTarget)}
                onMouseLeave={endHover}
                className={`relative z-10 transition-opacity ${
                  isFuture ? "opacity-40 hover:opacity-90" : ""
                } ${item.status === "skipped" ? "opacity-50" : ""}`}
              >
                <span
                  className={`${circleClasses(item, isNext, item.id === selectedId, item.id === busyItemId)} ${
                    isUserMsg ? "!bg-[#d9fdd3]" : ""
                  }`}
                >
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logo}
                      alt=""
                      className={`h-full w-full object-contain p-1 transition-all ${logoClasses(item, isNext)}`}
                    />
                  ) : (
                    <span
                      className={
                        isNext || item.id === busyItemId
                          ? "text-orange"
                          : item.status === "done"
                            ? "text-foreground/70"
                            : "text-muted-foreground/60"
                      }
                    >
                      {icon(item)}
                    </span>
                  )}
                </span>
                {/* event-type glyph, WhatsApp-status-badge style */}
                {logo && (
                  <span className="absolute -bottom-1 -right-1 flex h-[22px] w-[22px] items-center justify-center rounded-full border bg-background shadow-sm">
                    {item.event.type === "agenda_processed" ? (
                      <ListTodo className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <FileText className="h-3 w-3 text-foreground/80" />
                    )}
                  </span>
                )}
                {/* administrative-body tag: ΔΣ council / ΔΕ committee / ΔΚ community */}
                {bodyTag && (
                  <span
                    className={`absolute -bottom-1 -left-1 flex h-[22px] w-[22px] items-center justify-center rounded-full border bg-background text-[9px] font-bold leading-none shadow-sm ${
                      bodyTag === "ΔΣ" ? "text-orange" : "text-muted-foreground"
                    }`}
                  >
                    {bodyTag}
                  </span>
                )}
                {messages > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-[20px] min-w-[20px] items-center justify-center rounded-full border-2 border-background bg-[#25d366] px-0.5 text-[10px] font-bold text-white">
                    {messages}
                  </span>
                )}
              </button>
              <span
                className={`mt-1 text-[10px] tabular-nums ${
                  isNext
                    ? "font-semibold text-orange"
                    : isFuture
                      ? "text-muted-foreground/50"
                      : "text-muted-foreground"
                }`}
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
  cityMeta?: CityMeta;
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
