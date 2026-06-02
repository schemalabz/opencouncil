import { ArrowUpRight, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { platformStats } from './mockData';

/**
 * Platform-proof bento, copying the reference "About Us" deck:
 * dark charcoal number cards with a concave-notched bottom-right corner and a
 * circular ↗ badge nested in it, interleaved with image placeholders and a text
 * card. Cards are NOT clickable — purely presentational.
 *
 * The notch is a radial-gradient mask carving a quarter-circle out of the card's
 * bottom-right corner; the badge is a sibling layered over it (so the mask, which
 * would otherwise clip it, leaves it intact).
 */

const formatHours = (h: number) => `${new Intl.NumberFormat('el-GR').format(h)}+`;
const formatCount = (n: number) => new Intl.NumberFormat('el-GR').format(n);

// Concave notch at the bottom-right corner. The transparent circle is concentric
// with the badge (centered 18px in from the corner) and sized to leave an even
// ~7px gap ring around it (badge r=20, scoop r=27).
const NOTCH_MASK =
    'radial-gradient(circle 27px at calc(100% - 18px) calc(100% - 18px), transparent 26px, #000 27px)';

export function StatTiles() {
    return (
        <section className="space-y-6">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl !text-left">Με μια ματιά</h2>

            <div className="grid auto-rows-[minmax(168px,1fr)] grid-cols-2 gap-4 lg:grid-cols-12">
                <StatCard
                    value={formatHours(platformStats.hoursSearchable)}
                    label="ώρες συζητήσεων, με αναζήτηση σε δευτερόλεπτα"
                    className="lg:col-span-3"
                />
                <ImagePlaceholder className="hidden lg:flex lg:col-span-6" />
                <StatCard
                    value={formatCount(platformStats.meetingsCount)}
                    label="συνεδριάσεις καταγεγραμμένες"
                    className="lg:col-span-3"
                />
                <TextCard />
                <StatCard
                    value={formatCount(platformStats.citiesCount)}
                    label="δήμοι & περιφέρειες"
                    className="lg:col-span-3"
                />
                <ImagePlaceholder className="hidden lg:flex lg:col-span-6" />
            </div>
        </section>
    );
}

function StatCard({ value, label, className }: { value: string; label: string; className?: string }) {
    return (
        <div className={cn('relative col-span-1', className)}>
            {/* Masked card body — the notch is carved here */}
            <div
                className="flex h-full flex-col justify-between rounded-3xl rounded-br-none bg-[#2e333b] p-5 pb-7 pr-12 text-white sm:p-6 sm:pb-7 sm:pr-14"
                style={{ WebkitMaskImage: NOTCH_MASK, maskImage: NOTCH_MASK }}
            >
                <div className="text-4xl font-bold leading-none tracking-tight sm:text-5xl">{value}</div>
                <div className="max-w-[88%] text-sm text-white/55">{label}</div>
            </div>
            {/* Badge nested in the notch (sibling, so the mask doesn't clip it).
                Centered 18px in from the corner → right/bottom = 18 - 20 = -2px. */}
            <span className="absolute bottom-[-2px] right-[-2px] flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground">
                <ArrowUpRight className="h-4 w-4" />
            </span>
        </div>
    );
}

function ImagePlaceholder({ className }: { className?: string }) {
    return (
        <div
            aria-hidden
            className={cn(
                'relative items-center justify-center overflow-hidden rounded-3xl border border-border bg-muted',
                className,
            )}
        >
            <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-accent/20 blur-2xl" />
            <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
        </div>
    );
}

function TextCard() {
    return (
        <div className="col-span-1 flex flex-col justify-center rounded-3xl bg-muted p-5 sm:p-6 lg:col-span-3">
            <p className="text-sm leading-relaxed text-foreground">
                Πραγματικά δεδομένα από κάθε <span className="font-semibold">επίσημη συνεδρίαση</span> —{' '}
                {formatCount(platformStats.subjectsCount)} θέματα δομημένα σε ομιλητές και χρόνο.
            </p>
        </div>
    );
}
