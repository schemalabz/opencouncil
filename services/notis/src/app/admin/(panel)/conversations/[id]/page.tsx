import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "../../_components/EmptyState";
import { PageHeader } from "../../_components/PageHeader";
import { getConversation } from "../../_lib/conversations";
import { ConversationDetailView } from "./view";

export const metadata = { title: "Συνομιλία · Νότης admin" };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = getConversation(id);

  if (!detail) {
    return (
      <>
        <PageHeader title="Συνομιλία" />
        <EmptyState icon={SearchX}>
          Η συνομιλία «{id}» δεν βρέθηκε — δεν υπάρχει ακόμα βάση δεδομένων.{" "}
          <Link href="/admin/conversations" className="text-orange hover:underline">
            ← Πίσω στις συνομιλίες
          </Link>
        </EmptyState>
      </>
    );
  }

  return <ConversationDetailView detail={detail} />;
}
