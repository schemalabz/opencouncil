// Bare route group — standalone documents (offer letters, etc.) that render
// their own chrome. No site header, footer, or background effect from the
// (other) shell.
export default function Layout({ children }: { children: React.ReactNode }) {
    return <main id="main-content">{children}</main>;
}
