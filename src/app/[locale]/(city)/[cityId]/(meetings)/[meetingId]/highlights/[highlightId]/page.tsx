import { notFound } from "next/navigation";
import { HighlightView } from "@/components/meetings/HighlightView";
import { getHighlight } from "@/lib/db/highlights";

export default async function HighlightPage({ params }: { params: { highlightId: string } }) {
    const { highlightId } = params;

    const highlight = await getHighlight(highlightId);

    if (!highlight) {
        notFound();
    }

    return (
        <div className="container mx-auto py-8 px-4">
            <HighlightView highlight={highlight} />
        </div>
    );
}