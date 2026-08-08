import Link from "next/link";
import { SearchX } from "lucide-react";
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
        <div className="flex flex-1 items-center justify-center">
          <div className="max-w-[300px] text-center">
            <SearchX className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Η συνομιλία «{id}» δεν βρέθηκε — δεν υπάρχει ακόμα βάση δεδομένων.
            </p>
            <Link
              href="/admin/conversations"
              className="mt-3 inline-block text-sm text-orange hover:underline"
            >
              ← Πίσω στις συνομιλίες
            </Link>
          </div>
        </div>
      </>
    );
  }

  return <ConversationDetailView detail={detail} />;
}
