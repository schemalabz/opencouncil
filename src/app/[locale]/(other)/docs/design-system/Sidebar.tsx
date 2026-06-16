// Sidebar.tsx
'use client';

import { Link, usePathname } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import type { SidebarSection } from './_registry';

const BASE = '/docs/design-system';

export function Sidebar({ sections }: { sections: SidebarSection[] }) {
    const pathname = usePathname();

    const link = (href: string, label: string) => {
        const active = pathname === href;
        return (
            <li key={href}>
                <Link
                    href={href}
                    className={cn(
                        'block rounded-md px-2 py-1.5 text-sm transition-colors',
                        active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                    )}
                >
                    {label}
                </Link>
            </li>
        );
    };

    return (
        <nav className="flex flex-col gap-8">
            <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overview</div>
                <ul className="flex flex-col gap-0.5">{link(BASE, 'Introduction')}</ul>
            </div>
            {sections.map((section) => (
                <div key={section.kind}>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section.label}</div>
                    <ul className="flex flex-col gap-0.5">
                        {link(`${BASE}/${section.kind}`, `All ${section.label.toLowerCase()}`)}
                        {section.items.map((item) => link(`${BASE}/${section.kind}/${item.slug}`, item.name))}
                    </ul>
                </div>
            ))}
        </nav>
    );
}
