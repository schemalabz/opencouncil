import { Activity } from "lucide-react";
import { EmptyState } from "../_components/EmptyState";
import { PageHeader } from "../_components/PageHeader";
import { listRecentWakes } from "../_lib/wakes";

export const metadata = { title: "Wakes · Νότης admin" };

export default function WakesPage() {
  const wakes = listRecentWakes();
  const sends = wakes.filter((w) => w.decision === "send").length;
  const errors = wakes.filter((w) => w.decision === "error").length;

  return (
    <>
      <PageHeader title="Wakes">
        <span className="text-xs tabular-nums text-muted-foreground">
          {wakes.length} πρόσφατα · {sends} sends · {errors} σφάλματα
        </span>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {wakes.length === 0 ? (
          <EmptyState icon={Activity}>
            Κανένα wake ακόμα. Εδώ θα κυλάει κάθε αφύπνιση του Νότη σε όλους τους χρήστες —
            γεγονός, απόφαση, κόστος, διάρκεια — με σύνδεσμο στη συνομιλία και το πλήρες trace
            της.
          </EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                {["Πότε", "Χρήστης", "Γεγονός", "Απόφαση", "Μηνύματα", "Κόστος", "Διάρκεια"].map(
                  (c) => (
                    <th key={c} className="pb-2 pr-4 font-medium">
                      {c}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {wakes.map((w) => (
                <tr key={w.id} className="border-b hover:bg-muted/40">
                  <td className="py-2.5 pr-4 text-xs tabular-nums">{w.at.slice(0, 16)}</td>
                  <td className="pr-4">
                    <a
                      href={`/admin/conversations/${w.conversationId}`}
                      className="hover:underline"
                    >
                      {w.userName}
                    </a>
                  </td>
                  <td className="pr-4 text-xs">{w.eventType}</td>
                  <td className="pr-4">
                    {w.decision === "send" ? "✉ έστειλε" : w.decision === "error" ? "⚠ σφάλμα" : "🤫 σιωπή"}
                  </td>
                  <td className="pr-4 tabular-nums">{w.messageCount}</td>
                  <td className="pr-4 tabular-nums">${w.costUsd.toFixed(3)}</td>
                  <td className="tabular-nums">{(w.durationMs / 1000).toFixed(1)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
