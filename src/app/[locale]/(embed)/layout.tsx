/**
 * Minimal layout for embed routes.
 * No navigation, no footer, no session provider overhead.
 * The locale layout above provides NextIntlClientProvider.
 */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
