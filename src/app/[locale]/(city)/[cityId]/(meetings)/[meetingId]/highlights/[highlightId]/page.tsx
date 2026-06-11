import { notFound } from "next/navigation";
import { HighlightView } from "@/components/meetings/HighlightView";
import { getHighlight } from "@/lib/db/highlights";
import { getPostHogClient } from "@/lib/posthog-server";

export default async function HighlightPage(props: { params: Promise<{ cityId: string; meetingId: string; highlightId: string }> }) {
    const params = await props.params;
    const { highlightId, cityId, meetingId } = params;

    const highlight = await getHighlight(highlightId);

    if (!highlight) {
        notFound();
    }

    const posthog = getPostHogClient();
    posthog.capture({
        distinctId: "anonymous",
        event: "highlight_viewed",
        properties: { highlight_id: highlightId, city_id: cityId, meeting_id: meetingId },
    });

    return (
        <div className="container mx-auto py-8 px-4">
            <HighlightView highlight={highlight} />
        </div>
    );
}