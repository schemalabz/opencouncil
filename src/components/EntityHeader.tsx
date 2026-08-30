/**
 * The identity band the person and party pages open with: the face or tile,
 * the name, a row of standing badges, and a line of countable facts, with the
 * admin corner on the right. The pages were carrying this frame as two
 * byte-identical copies; the interiors (what the badges and facts say) stay
 * with each page.
 */
export function EntityHeader({ avatar, name, badges, facts, admin }: {
    avatar: React.ReactNode;
    name: string;
    badges?: React.ReactNode;
    facts?: React.ReactNode;
    admin?: React.ReactNode;
}) {
    return (
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
            {avatar}
            <div className="min-w-0 flex-1">
                <h1 className="text-2xl leading-tight tracking-tight sm:text-3xl">{name}</h1>
                {badges && <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">{badges}</div>}
                {facts && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
                        {facts}
                    </div>
                )}
            </div>
            {admin}
        </header>
    );
}

/** The separator between two facts on the band's facts line. */
export function FactDot() {
    return <span aria-hidden>·</span>;
}
