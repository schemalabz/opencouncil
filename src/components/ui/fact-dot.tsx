/**
 * The separator between two facts on a line of them — an identity band's
 * counts, a hot-topic entry's meeting details, a card's footer links.
 *
 * It lives here rather than beside {@link EntityHeader} because nothing about
 * it is header-specific, and while it sat there every other surface that needed
 * a dot wrote its own `<span aria-hidden>` instead.
 *
 * `className` is for the dot's own colour, which is not always the colour of
 * the facts it separates.
 */
export function FactDot({ className }: { className?: string }) {
    return <span className={className} aria-hidden>·</span>;
}
