/**
 * el-GR date/number rendering, shared so every admin surface agrees. (This
 * package can't reach the main app's formatters; these are the notis set.)
 */

/** 10/8/2026 */
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("el-GR");
}

/** 10/8/2026, 14:35 */
export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("el-GR", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 14:35 */
export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" });
}

/** Κυριακή 10 Αυγούστου */
export function fmtLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString("el-GR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** ΚΥΡΙΑΚΗ 10 ΑΥΓΟΥΣΤΟΥ — the WhatsApp day-separator chip. */
export function fmtDateChip(iso: string): string {
  return fmtLongDate(iso).toUpperCase();
}

/** Thousands-separated integer. */
export function fmtInt(n: number): string {
  return n.toLocaleString("el-GR");
}

/** «μόλις τώρα», «πριν 5′», «πριν 3 ώρες», «χθες 14:35», «πριν 4 ημέρες». */
export function fmtTimeAgo(iso: string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "μόλις τώρα";
  if (minutes < 60) return `πριν ${minutes}′`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "πριν 1 ώρα" : `πριν ${hours} ώρες`;
  const days = Math.floor(hours / 24);
  if (days === 1) return `χθες ${fmtTime(iso)}`;
  if (days < 7) return `πριν ${days} ημέρες`;
  return fmtDate(iso);
}
