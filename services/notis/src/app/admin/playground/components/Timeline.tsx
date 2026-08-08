"use client";

import { useEffect, useRef } from "react";
import { AlarmClock, FileText, ListTodo, MessageCircle, Moon } from "lucide-react";
import { QueueItem } from "../types";

interface Props {
  queue: QueueItem[];
  selectedId?: string;
  busyItemId?: string;
  onSelect(id: string): void;
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

function tooltip(item: QueueItem): string {
  const e = item.event;
  const when = new Date(e.at).toLocaleDateString("el-GR", { day: "numeric", month: "long" });
  const what =
    e.type === "agenda_processed"
      ? `Ατζέντα · ${e.meetingName}`
      : e.type === "meeting_summarized"
        ? `Πρακτικά · ${e.meetingName}`
        : e.type === "user_message"
          ? `Μήνυμα: «${e.text.slice(0, 60)}»`
          : e.type === "scheduled"
            ? `Follow-up: ${e.reason.slice(0, 60)}`
            : "Heartbeat";
  const outcome =
    item.status === "skipped"
      ? " — παραλείφθηκε"
      : item.outcome
        ? item.outcome.decision === "send"
          ? ` — έστειλε ${item.outcome.messages.length}`
          : " — σιωπή"
        : "";
  return `${when} · ${what}${outcome}`;
}

function nodeClasses(item: QueueItem, isNext: boolean, isSelected: boolean, isBusy: boolean): string {
  const base =
    "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all";
  const ring = isSelected ? " ring-2 ring-orange ring-offset-2 ring-offset-background" : "";
  if (isBusy) return `${base} animate-pulse border-orange bg-orange text-white${ring}`;
  if (item.status === "skipped")
    return `${base} border-dashed border-muted-foreground/40 bg-background text-muted-foreground/50${ring}`;
  if (item.status === "done" && item.outcome?.decision === "send")
    return `${base} border-orange bg-orange text-white${ring}`;
  if (item.status === "done")
    return `${base} border-muted-foreground/30 bg-muted text-muted-foreground${ring}`;
  if (isNext) return `${base} border-orange bg-background text-orange animate-pulse${ring}`;
  return `${base} border-muted-foreground/30 bg-background text-muted-foreground/60${ring}`;
}

export function Timeline({ queue, selectedId, busyItemId, onSelect }: Props) {
  const nextId = queue.find((q) => q.status === "pending")?.id;
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    nextRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [nextId]);

  let lastMonth = "";

  return (
    <div ref={scrollRef} className="overflow-x-auto border-b bg-muted/30">
      <div className="relative flex min-w-max items-start gap-0 px-6 py-3">
        {/* connecting line through the node centers */}
        <div className="absolute left-0 right-0 top-[27px] h-0.5 bg-border" />
        {queue.map((item) => {
          const date = new Date(item.event.at);
          const month = date.toLocaleDateString("el-GR", { month: "short" });
          const showMonth = month !== lastMonth;
          lastMonth = month;
          const isNext = item.id === nextId;
          const messages = item.outcome?.messages.length ?? 0;
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
                title={tooltip(item)}
                onClick={() => onSelect(item.id)}
                className={nodeClasses(item, isNext, item.id === selectedId, item.id === busyItemId)}
              >
                {icon(item)}
                {messages > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#25d366] px-0.5 text-[9px] font-bold text-white">
                    {messages}
                  </span>
                )}
              </button>
              <span
                className={`mt-1 text-[10px] tabular-nums ${isNext ? "font-semibold text-orange" : "text-muted-foreground"}`}
              >
                {date.getDate()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
