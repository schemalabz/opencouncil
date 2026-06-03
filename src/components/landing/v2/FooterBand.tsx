import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { SignupDialog } from './SignupDialog';
import { Eyebrow } from './shared';

/**
 * Footer band (from the design): an accent-tint CTA band + link columns + base row.
 */
const COLS: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
    {
        title: 'Πλατφόρμα',
        links: [
            { label: 'Δήμοι', href: '/map' },
            { label: 'Αναζήτηση', href: '/search' },
            { label: 'Explainers', href: '/explain' },
        ],
    },
    {
        title: 'OpenCouncil',
        links: [
            { label: 'Σχετικά', href: '/about' },
            { label: 'Για δήμους', href: '/about' },
            { label: 'Επικοινωνία', href: '/about' },
        ],
    },
    {
        title: 'Νομικά',
        links: [
            { label: 'Όροι χρήσης', href: '/terms' },
            { label: 'Απόρρητο', href: '/privacy' },
        ],
    },
];

export function FooterBand() {
    return (
        <footer className="space-y-12">
            {/* CTA band */}
            <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-[hsl(var(--orange))]/10 p-8 sm:flex-row sm:items-center sm:p-12">
                <h2 className="max-w-md text-3xl font-bold tracking-tight sm:text-4xl">
                    Η τοπική δημοκρατία, <span className="text-[hsl(var(--orange))]">στα χέρια σου.</span>
                </h2>
                <SignupDialog>
                    <Button
                        size="lg"
                        className="shrink-0 rounded-full bg-[hsl(var(--orange))] text-white hover:bg-[hsl(var(--orange))]/90"
                    >
                        Εγγραφή — δωρεάν
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </SignupDialog>
            </div>

            {/* Columns */}
            <div className="grid grid-cols-2 gap-8 border-b border-border pb-10 md:grid-cols-4">
                <div className="col-span-2 max-w-xs space-y-3 md:col-span-1">
                    <span className="text-lg font-bold">OpenCouncil</span>
                    <p className="text-sm text-muted-foreground">
                        Κάνουμε τα δημοτικά συμβούλια κατανοητά και εύκολα προσβάσιμα για κάθε πολίτη.
                    </p>
                </div>
                {COLS.map((col) => (
                    <div key={col.title} className="space-y-3">
                        <Eyebrow>{col.title}</Eyebrow>
                        <ul className="space-y-2.5">
                            {col.links.map((l) => (
                                <li key={l.label}>
                                    <Link
                                        href={l.href}
                                        className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                                    >
                                        {l.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>

            {/* Base row */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>© {2026} OpenCouncil</span>
                <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-[3px] bg-[hsl(var(--orange))]" />
                    Φτιαγμένο με μεράκι στην Ελλάδα
                </span>
            </div>
        </footer>
    );
}
