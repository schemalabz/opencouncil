import { MessagesSquare } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "../_components/EmptyState";
import { PageHeader } from "../_components/PageHeader";
import { Pager } from "../_components/Pager";
import { StopBadge } from "../_components/StopBadge";
import { UserAvatar } from "../_components/UserAvatar";
import { ConversationSummary, listConversations } from "../_lib/conversations";
import { fmtDate, fmtInt, fmtTimeAgo } from "../_lib/format";
import { parsePage } from "../_lib/paging";
import { Origin } from "../_lib/records";

export const metadata = { title: "Συνομιλίες · Νότης admin" };

/**
 * The conversation list, sorted by last activity: who talks to the Notis,
 * what they last said, whether anything failed, and what each conversation
 * costs. Rows link into the thread.
 */

const ORIGIN_LABELS: Record<Origin, string> = {
  inbound: "ήρθε με μήνυμα",
  transition: "μετάβαση",
  signup: "εγγραφή site",
};

function LastMessageCell({ conversation }: { conversation: ConversationSummary }) {
  const last = conversation.lastMessage;
  if (!last) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="min-w-0">
      <p className="line-clamp-1 text-xs leading-relaxed">
        {last.direction === "outbound" && (
          <span className="font-medium text-muted-foreground">Νότης: </span>
        )}
        {last.body.trim()}
      </p>
      <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
        {fmtTimeAgo(last.at)}
      </p>
    </div>
  );
}

function listHref(q: string, page = 1): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/conversations?${query}` : "/admin/conversations";
}

export default async function ConversationsPage(props: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const q = (searchParams.q ?? "").trim();
  const { conversations, total, page, pages } = await listConversations(
    q || undefined,
    parsePage(searchParams.page),
  );

  return (
    <>
      <PageHeader title="Συνομιλίες">
        <span className="text-xs text-muted-foreground">
          {fmtInt(total)} {q ? "στην αναζήτηση" : "συνολικά"}
        </span>
        <form method="GET" className="ml-auto">
          <input
            name="q"
            defaultValue={q}
            placeholder="Αναζήτηση ονόματος ή τηλεφώνου…"
            className="w-64 rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground"
          />
        </form>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {conversations.length === 0 ? (
          <EmptyState icon={MessagesSquare}>
            {q
              ? "Καμία συνομιλία δεν ταιριάζει στην αναζήτηση."
              : "Καμία συνομιλία ακόμα. Κάθε πραγματική συζήτηση με τον Νότη εμφανίζεται εδώ — με το ίδιο interface που έχει το playground."}
          </EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Χρήστης</th>
                <th className="pb-2 pr-4 font-medium">Δήμοι</th>
                <th className="w-full pb-2 pr-4 font-medium">Τελευταίο μήνυμα</th>
                <th className="pb-2 pr-4 text-right font-medium">Μηνύματα</th>
                <th className="pb-2 pr-4 text-right font-medium">Wakes</th>
                <th className="pb-2 pr-4 text-right font-medium">Κόστος</th>
                <th className="pb-2 font-medium">Κατάσταση</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((c) => (
                <tr key={c.id} className="border-b align-middle hover:bg-muted/40">
                  <td className="whitespace-nowrap py-2.5 pr-4">
                    <div className="flex items-center gap-2.5">
                      <UserAvatar seed={c.userId} />
                      <div>
                        <Link
                          href={`/admin/conversations/${c.id}`}
                          className="font-medium hover:underline"
                        >
                          {c.userName}
                        </Link>
                        <p className="text-[11px] text-muted-foreground">
                          {c.phone} · {ORIGIN_LABELS[c.origin]} {fmtDate(c.startedAt)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-40 truncate py-2.5 pr-4 text-xs text-muted-foreground">
                    {c.cityNames.join(", ") || "—"}
                  </td>
                  <td className="py-2.5 pr-4">
                    <Link href={`/admin/conversations/${c.id}`} className="block">
                      <LastMessageCell conversation={c} />
                    </Link>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right text-xs tabular-nums">
                    {fmtInt(c.messagesSent)} προς · {fmtInt(c.messagesReceived)} από
                    {c.messagesFailed > 0 && (
                      <p className="mt-0.5 font-medium text-red-600">
                        {fmtInt(c.messagesFailed)} απέτυχαν
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right text-xs tabular-nums">
                    {fmtInt(c.wakes)}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right text-xs tabular-nums">
                    ${c.costUsd.toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap py-2.5">
                    {c.unsubscribedAt ? (
                      <StopBadge />
                    ) : (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                        ενεργή
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-3">
          <Pager page={page} pages={pages} total={total} hrefFor={(p) => listHref(q, p)} />
        </div>
      </div>
    </>
  );
}
