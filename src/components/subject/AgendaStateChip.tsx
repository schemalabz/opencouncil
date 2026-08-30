import { cn } from '@/lib/utils';
import { getAgendaFullLabel, getWithdrawnLabel, type Translate } from '@/lib/utils/subjects';

type AgendaStateSubject = {
    withdrawn: boolean;
    agendaItemIndex: number | null;
    nonAgendaReason: string | null;
};

/**
 * The agenda-state chip: an item's place on the ημερήσια διάταξη, or the state
 * that kept it off it. Withdrawn wins — a pulled item's number no longer means
 * anything. Text stays in its written case; no uppercase transform touches it.
 * Shared by the city timeline's cards and the contribution cards, so the two
 * surfaces cannot disagree about whether an item is live.
 */
export function AgendaStateChip({ subject, t, className }: {
    subject: AgendaStateSubject;
    t: Translate;
    className?: string;
}) {
    const base = 'inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-semibold leading-none';
    if (subject.withdrawn) {
        return (
            <span className={cn(base, 'border border-border italic text-muted-foreground', className)}>
                {getWithdrawnLabel(t, subject)}
            </span>
        );
    }
    const label = getAgendaFullLabel(t, subject);
    if (label === null) return null;
    if (subject.agendaItemIndex) {
        return <span className={cn(base, 'bg-muted text-muted-foreground', className)}>{label}</span>;
    }
    return (
        <span
            className={cn(
                base,
                'border text-muted-foreground',
                subject.nonAgendaReason === 'beforeAgenda' ? 'border-dashed border-muted-foreground/40' : 'border-border',
                className,
            )}
        >
            {label}
        </span>
    );
}
