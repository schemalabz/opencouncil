import { Metadata } from "next";

// The settings page is a client component, so its metadata lives here.
// Auth-gated meeting settings — noindex, and null out the canonical inherited
// from the meeting layout so a noindexed page doesn't also emit one.
export const metadata: Metadata = {
    robots: { index: false, follow: false },
    alternates: null,
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
