"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Close one open request, then re-render the server list. */
export function CloseButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function close() {
    if (!window.confirm("Να κλείσει το αίτημα; Κλείσ' το αφού επικοινωνήσει η ομάδα με τον χρήστη.")) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/support-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
      if (response.ok) router.refresh();
      else window.alert("Το αίτημα δεν έκλεισε. Ίσως το έκλεισε ήδη κάποιος άλλος.");
    } catch {
      window.alert("Το αίτημα δεν έκλεισε: σφάλμα δικτύου. Δοκίμασε ξανά.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={close}
      disabled={busy}
      className="rounded border px-2 py-1 text-xs transition-colors hover:bg-muted disabled:opacity-50"
    >
      {busy ? "Κλείνει…" : "Κλείσιμο"}
    </button>
  );
}
