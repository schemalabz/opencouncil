import { fmtDate } from "../_lib/format";

/** The red ΣΤΟΠ (unsubscribed) badge, identical wherever a conversation's state shows. */
export function StopBadge({ at }: { at?: string }) {
  return (
    <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
      ΣΤΟΠ{at ? ` · ${fmtDate(at)}` : ""}
    </span>
  );
}
