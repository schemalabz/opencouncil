/** The two-segment coverage bar the header and every city row share. */
export function CoverageStrip({ content, linked, eligible, className }: {
    content: number; linked: number; eligible: number; className?: string;
}) {
    const pct = (n: number) => eligible === 0 ? 0 : (100 * n) / eligible;
    return (
        <span aria-hidden className={`flex overflow-hidden rounded-full bg-muted ${className ?? 'h-1'}`}>
            <i className="bg-green-600" style={{ width: `${pct(content)}%` }} />
            <i className="bg-green-600/40" style={{ width: `${pct(Math.max(linked - content, 0))}%` }} />
        </span>
    );
}
