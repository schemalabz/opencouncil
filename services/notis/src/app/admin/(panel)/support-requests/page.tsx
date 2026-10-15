import { getAdminSession } from "@/lib/session-auth";
import { redirect } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import Link from "next/link";
import {
  SUPPORT_REQUEST_KIND_LABELS,
  SUPPORT_REQUEST_STATUS_LABELS,
} from "@/lib/support-requests";
import { EmptyState } from "../_components/EmptyState";
import { PageHeader } from "../_components/PageHeader";
import { Pager } from "../_components/Pager";
import { UserAvatar } from "../_components/UserAvatar";
import { fmtDateTime, fmtInt, fmtTimeAgo } from "../_lib/format";
import { parsePage } from "../_lib/paging";
import { SupportRequestRow, listSupportRequests } from "../_lib/support-requests";
import { CloseButton } from "./CloseButton";

export const metadata = { title: "Αιτήματα · Νότης admin" };

/**
 * Readers who want a person on the OpenCouncil team: the agent files a
 * request when a reader is unhappy, asks for a person, or reports wrong
 * data. Open requests come first. The team contacts the reader, then closes
 * the request here.
 */

function StatusBadge({ row }: { row: SupportRequestRow }) {
  const at = row.closedAt ?? row.withdrawnAt;
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
        row.status === "open" ? "bg-orange/10 text-orange" : "bg-muted text-muted-foreground"
      }`}
      title={at ? fmtDateTime(at.toISOString()) : undefined}
    >
      {SUPPORT_REQUEST_STATUS_LABELS[row.status]}
    </span>
  );
}

export default async function SupportRequestsPage(props: {
  searchParams: Promise<{ page?: string }>;
}) {
  // Re-assert auth in the page body: the (panel) layout guard does not
  // re-run on an RSC soft-navigation, so a segment request can reach this
  // page without it (enforced by the admin-auth-guard test).
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const searchParams = await props.searchParams;
  const { rows, openCount, total, page, pages } = await listSupportRequests(
    parsePage(searchParams.page),
  );

  return (
    <>
      <PageHeader title="Αιτήματα">
        <span className="text-xs text-muted-foreground">
          {fmtInt(openCount)} ανοιχτά · {fmtInt(total)} συνολικά
        </span>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {rows.length === 0 ? (
          <EmptyState icon={LifeBuoy}>
            Κανένα αίτημα ακόμα. Όταν ένας χρήστης είναι δυσαρεστημένος, ζητά άνθρωπο ή αναφέρει
            λάθος στοιχεία, ο Νότης το καταγράφει εδώ για να επικοινωνήσει η ομάδα μαζί του.
          </EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Πότε</th>
                <th className="pb-2 pr-4 font-medium">Χρήστης</th>
                <th className="pb-2 pr-4 font-medium">Είδος</th>
                <th className="w-full pb-2 pr-4 font-medium">Σύνοψη</th>
                <th className="pb-2 pr-4 font-medium">Κατάσταση</th>
                <th className="pb-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b align-top hover:bg-muted/40 ${r.status === "open" ? "" : "opacity-60"}`}
                >
                  <td
                    className="whitespace-nowrap py-2.5 pr-4 text-xs tabular-nums text-muted-foreground"
                    title={fmtDateTime(r.createdAt.toISOString())}
                  >
                    {fmtTimeAgo(r.createdAt.toISOString())}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <UserAvatar seed={r.subscription.userId} size={24} />
                      <div>
                        <Link
                          href={`/admin/conversations/${r.subscriptionId}`}
                          className="font-medium hover:underline"
                        >
                          {r.subscription.userName ?? "—"}
                        </Link>
                        <div className="text-xs tabular-nums text-muted-foreground">
                          {r.subscription.phone ?? "—"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-xs text-muted-foreground">
                    {SUPPORT_REQUEST_KIND_LABELS[r.kind]}
                  </td>
                  <td className="py-2.5 pr-4">
                    <p className="text-xs leading-relaxed">{r.summary}</p>
                    <p
                      className="mt-1 line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-muted-foreground"
                      title={r.readerWords}
                    >
                      Είπε: «{r.readerWords}»
                    </p>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4">
                    <StatusBadge row={r} />
                  </td>
                  <td className="whitespace-nowrap py-2.5 text-right">
                    {r.status === "open" && <CloseButton id={r.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-3">
          <Pager
            page={page}
            pages={pages}
            total={total}
            hrefFor={(p) => (p > 1 ? `/admin/support-requests?page=${p}` : "/admin/support-requests")}
          />
        </div>
      </div>
    </>
  );
}
