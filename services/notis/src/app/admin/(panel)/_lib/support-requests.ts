import "server-only";
import { hasNotisDb, notisDb } from "@/lib/db";
import type { Prisma } from "../../../../../generated/client";
import { clampPage, pageCount } from "./paging";

/** The support-request list. Empty without NOTIS_DATABASE_URL. */

const SUPPORT_REQUEST_SELECT = {
  id: true,
  subscriptionId: true,
  kind: true,
  status: true,
  summary: true,
  readerWords: true,
  createdAt: true,
  withdrawnAt: true,
  closedAt: true,
  subscription: { select: { userId: true, userName: true, phone: true } },
} satisfies Prisma.NotisSupportRequestSelect;

/** One request as Prisma returns it. Only the server page renders it, so it
 *  needs no conversion for a client component. */
export type SupportRequestRow = Prisma.NotisSupportRequestGetPayload<{
  select: typeof SUPPORT_REQUEST_SELECT;
}>;

export const SUPPORT_REQUESTS_PAGE_SIZE = 50;

export async function listSupportRequests(page = 1): Promise<{
  rows: SupportRequestRow[];
  openCount: number;
  total: number;
  page: number;
  pages: number;
}> {
  if (!hasNotisDb()) return { rows: [], openCount: 0, total: 0, page: 1, pages: 1 };
  const db = notisDb();
  const [total, openCount] = await Promise.all([
    db.notisSupportRequest.count(),
    db.notisSupportRequest.count({ where: { status: "open" } }),
  ]);
  const current = clampPage(page, total, SUPPORT_REQUESTS_PAGE_SIZE);
  const rows = await db.notisSupportRequest.findMany({
    // Postgres sorts an enum by its declaration order: open, withdrawn,
    // closed. So the open requests come first, newest first.
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    skip: (current - 1) * SUPPORT_REQUESTS_PAGE_SIZE,
    take: SUPPORT_REQUESTS_PAGE_SIZE,
    select: SUPPORT_REQUEST_SELECT,
  });
  return {
    rows,
    openCount,
    total,
    page: current,
    pages: pageCount(total, SUPPORT_REQUESTS_PAGE_SIZE),
  };
}

/** Close an open request. False when no open request has that id. */
export async function closeSupportRequest(id: string): Promise<boolean> {
  if (!hasNotisDb()) return false;
  const closed = await notisDb().notisSupportRequest.updateMany({
    where: { id, status: "open" },
    data: { status: "closed", closedAt: new Date() },
  });
  return closed.count > 0;
}
