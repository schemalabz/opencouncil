import Admin from "@/components/meetings/admin/Admin";
import { isUserAuthorizedToEdit, getUnreleasedScope } from "@/lib/auth";
import { notFound } from "next/navigation";
import { Metadata } from "next";

// Auth-gated meeting admin — noindex, and null out the canonical inherited
// from the meeting layout so a noindexed page doesn't also emit one.
export const metadata: Metadata = {
    robots: { index: false, follow: false },
    alternates: null,
};

export default async function AdminPage(props: {
    params: Promise<{ cityId: string; meetingId: string }>;
}) {
    // The parent meeting layout computes `editable` but still renders this page
    // for anyone — and a layout guard would not re-run on an RSC navigation
    // anyway. Gate here, at city-admin scope (not superadmin), so the check
    // fires on every render path. `notFound()` hides the page's existence.
    const { cityId, meetingId } = await props.params;
    const [editable, scope] = await Promise.all([
        isUserAuthorizedToEdit({ cityId, councilMeetingId: meetingId }),
        // Which bodies the edit form offers: all of them to a city admin, the
        // admin's own bodies to a body admin.
        getUnreleasedScope(cityId),
    ]);
    if (!editable) {
        notFound();
    }

    return (
        <div className="container py-8">
            <Admin editableBodyIds={scope.all ? undefined : scope.bodyIds} />
        </div>
    );
}
