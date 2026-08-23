import Admin from "@/components/meetings/admin/Admin";
import { isUserAuthorizedToEdit } from "@/lib/auth";
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
    const { cityId } = await props.params;
    if (!(await isUserAuthorizedToEdit({ cityId }))) {
        notFound();
    }

    return (
        <div className="container py-8">
            <Admin />
        </div>
    );
}
