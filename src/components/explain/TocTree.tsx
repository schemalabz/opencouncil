import { cn } from "@/lib/utils";

export interface TocSection {
    id: string;
    title: string;
}

/** The table of contents as a tree: a part, its sections, and the parts of a section that has them. */
export interface TocGroup extends TocSection {
    items: (TocSection & { children?: TocSection[] })[];
}

/**
 * The three-level table of contents of /explain, used twice: in the desktop
 * column, where ExplainReader marks the current entry through the data-toc-*
 * attributes, and in the mobile drawer, where `activeId` marks it and
 * `onSelect` closes the drawer before the page scrolls.
 */
export function TocTree({
    groups,
    activeId,
    onSelect,
}: {
    groups: TocGroup[];
    activeId?: string | null;
    onSelect?: (id: string) => void;
}) {
    const current = (id: string) => (activeId !== undefined && id === activeId ? "true" : undefined);
    /** A part is current while any entry under it is. */
    const holds = (ids: string[]) => (activeId && ids.includes(activeId) ? "true" : undefined);
    const linkProps = (id: string) =>
        onSelect
            ? {
                  href: `#${id}`,
                  onClick: (e: React.MouseEvent) => {
                      e.preventDefault();
                      onSelect(id);
                  },
              }
            : { href: `#${id}` };

    return (
        <ol className="space-y-5">
            {groups.map((g) => (
                <li key={g.id} data-toc-group={g.id}>
                    <a
                        {...linkProps(g.id)}
                        data-toc-grouphead
                        aria-current={current(g.id) ?? holds(g.items.flatMap((it) => [it.id, ...(it.children?.map((c) => c.id) ?? [])]))}
                        className="block py-1 text-sm font-bold text-foreground/80 transition-colors hover:text-orange aria-[current=true]:text-orange"
                    >
                        {g.title}
                    </a>
                    <ol className="mt-1.5 space-y-0.5">
                        {g.items.map((it) => (
                            <li key={it.id} data-toc-subgroup={it.children ? it.id : undefined}>
                                <a
                                    {...linkProps(it.id)}
                                    data-toc-subhead={it.children ? "" : undefined}
                                    aria-current={current(it.id) ?? holds(it.children?.map((c) => c.id) ?? [])}
                                    className={cn(
                                        "block border-l-2 border-border py-1.5 pl-3.5 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground",
                                        "aria-[current=true]:border-orange aria-[current=true]:font-semibold aria-[current=true]:text-orange",
                                    )}
                                >
                                    {it.title}
                                </a>
                                {it.children && (
                                    <ol className="space-y-0.5">
                                        {it.children.map((sub) => (
                                            <li key={sub.id}>
                                                <a
                                                    {...linkProps(sub.id)}
                                                    aria-current={current(sub.id)}
                                                    className="block border-l-2 border-border py-1 pl-7 text-[13px] leading-snug text-muted-foreground/80 transition-colors hover:text-foreground aria-[current=true]:border-orange aria-[current=true]:text-orange"
                                                >
                                                    {sub.title}
                                                </a>
                                            </li>
                                        ))}
                                    </ol>
                                )}
                            </li>
                        ))}
                    </ol>
                </li>
            ))}
        </ol>
    );
}
