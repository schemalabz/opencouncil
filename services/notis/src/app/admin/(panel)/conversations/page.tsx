import { getAdminSession } from "@/lib/session-auth";
import { redirect } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "../_components/EmptyState";
import { PageHeader } from "../_components/PageHeader";
import { StopBadge } from "../_components/StopBadge";
import { listConversations } from "../_lib/conversations";
import { fmtDate } from "../_lib/format";

export const metadata = { title: "Συνομιλίες · Νότης admin" };

const COLUMNS = ["Χρήστης", "Δήμοι", "Έναρξη", "Τελευταία δραστηριότητα", "Μηνύματα", "Κατάσταση"];

export default async function ConversationsPage() {
  // Re-assert auth in the page body: the (panel) layout guard does not
  // re-run on an RSC soft-navigation, so a segment request can reach this
  // page without it (enforced by the admin-auth-guard test).
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const conversations = await listConversations();

  return (
    <>
      <PageHeader title="Συνομιλίες">
        <span className="text-xs text-muted-foreground">{conversations.length} συνολικά</span>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              {COLUMNS.map((c) => (
                <th key={c} className="pb-2 pr-4 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {conversations.map((c) => (
              <tr key={c.id} className="border-b hover:bg-muted/40">
                <td className="py-2.5 pr-4">
                  <Link href={`/admin/conversations/${c.id}`} className="font-medium hover:underline">
                    {c.userName}
                  </Link>
                  <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span>
                </td>
                <td className="pr-4">{c.cityNames.join(", ")}</td>
                <td className="pr-4 text-xs">{fmtDate(c.startedAt)}</td>
                <td className="pr-4 text-xs">{fmtDate(c.lastActivityAt)}</td>
                <td className="pr-4 tabular-nums">
                  {c.messagesSent} ↦ · {c.messagesReceived} ↤
                </td>
                <td>
                  {c.unsubscribedAt ? (
                    <StopBadge />
                  ) : (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                      ενεργή
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {conversations.length === 0 && (
          <EmptyState icon={MessagesSquare}>
            Καμία συνομιλία ακόμα. Όταν συνδεθεί η βάση (PR 2), κάθε πραγματική συζήτηση με τον
            Νότη θα εμφανίζεται εδώ — με το ίδιο interface που έχει το playground.
          </EmptyState>
        )}
      </div>
    </>
  );
}
