import { Metadata } from "next";

// Iframe content — indexed standalone it would be a duplicate fragment.
export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

/**
 * Minimal layout for embed routes.
 * No navigation, no footer, no session provider overhead.
 * The locale layout above provides NextIntlClientProvider.
 */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
