/** Offset paging shared by the admin lists. */

export function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Clamp into range so a stale ?page=99 link shows the last page, not a void. */
export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.min(page, pageCount(total, pageSize));
}
