import Admin from "@/components/meetings/admin/Admin";
import { Metadata } from "next";

// Auth-gated meeting admin — noindex, and null out the canonical inherited
// from the meeting layout so a noindexed page doesn't also emit one.
export const metadata: Metadata = {
    robots: { index: false, follow: false },
    alternates: null,
};

export default async function AdminPage() {
    return (
        <div className="container py-8">
            <Admin />
        </div>
    );
}
