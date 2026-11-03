import Admin from "@/components/meetings/admin/Admin";
import { hasRight, heldScope, rightsFor } from "@/lib/auth";
import { ADMIN_PAGE_RIGHTS } from "@/lib/auth/rights";
import { getMeetingBodySettings } from "@/lib/db/administrativeBodies";
import { getCityRealm } from "@/lib/db/cityRealm";
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
    // The parent meeting layout computes the rights but still renders this page
    // for anyone — and a layout guard would not re-run on an RSC navigation
    // anyway. Gate here, on the rights the page has a section for, so the
    // check fires on every render path. `notFound()` hides the page's existence.
    const { cityId, meetingId } = await props.params;
    const [rights, scope, cityAdmin, realm] = await Promise.all([
        rightsFor({ cityId, councilMeetingId: meetingId }),
        // Which bodies the edit form offers: all of them to a holder on the
        // city, their own bodies to a holder on a body.
        heldScope('meeting.manage', cityId),
        // The cache and the operator act on the city, as their routes check.
        hasRight('admin', { cityId }),
        getCityRealm(cityId),
    ]);
    if (!ADMIN_PAGE_RIGHTS.some((right) => rights.includes(right))) {
        notFound();
    }
    const [bodySettings, realmAdmin] = await Promise.all([
        getMeetingBodySettings(cityId, meetingId),
        // A send that skips the approval queue needs `admin` on the realm, as the notifications route checks.
        realm ? hasRight('admin', { realm }) : false,
    ]);

    return (
        <div className="container py-8">
            <Admin
                notificationBehavior={bodySettings?.notificationBehavior ?? null}
                editableBodyIds={scope.all ? undefined : scope.bodyIds}
                cityAdmin={cityAdmin}
                realmAdmin={realmAdmin}
            />
        </div>
    );
}
