import { MessagesSquare } from "lucide-react";
import { PageHeader } from "../_components/PageHeader";
import { listConversations } from "../_lib/conversations";

export const metadata = { title: "Συνομιλίες · Νότης admin" };

const COLUMNS = ["Χρήστης", "Δήμοι", "Έναρξη", "Τελευταία δραστηριότητα", "Μηνύματα", "Κατάσταση"];

export default function ConversationsPage() {
  const conversations = listConversations();

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
                  <a href={`/admin/conversations/${c.id}`} className="font-medium hover:underline">
                    {c.userName}
                  </a>
                  <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span>
                </td>
                <td className="pr-4">{c.cityNames.join(", ")}</td>
                <td className="pr-4 text-xs">{c.startedAt.slice(0, 10)}</td>
                <td className="pr-4 text-xs">{c.lastActivityAt.slice(0, 10)}</td>
                <td className="pr-4 tabular-nums">
                  {c.messagesSent} ↦ · {c.messagesReceived} ↤
                </td>
                <td>
                  {c.unsubscribedAt ? (
                    <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                      ΣΤΟΠ
                    </span>
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
          <div className="flex min-h-[320px] items-center justify-center">
            <div className="max-w-[300px] text-center">
              <MessagesSquare className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Καμία συνομιλία ακόμα. Όταν συνδεθεί η βάση (PR 2), κάθε πραγματική συζήτηση με
                τον Νότη θα εμφανίζεται εδώ — με το ίδιο interface που έχει το playground.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
