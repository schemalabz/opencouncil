'use client';
import { MeetingStageChip } from '@/components/meetings/stage/MeetingStageChip';
import { PUBLIC_MEETING_STAGES } from '@/lib/meetingStage';
import type { PresentationKey } from '@/lib/meetingPresentation';

/** One sentence per symbol: what is true of the meeting while it shows it. */
const SENTENCE: Record<PresentationKey, string> = {
    upcoming: 'Η συνεδρίαση έχει προγραμματιστεί, και το OpenCouncil εμφανίζει τα θέματα της ημερήσιας διάταξης.',
    live: 'Η συνεδρίαση συμβαίνει τώρα.',
    waiting: 'Η συνεδρίαση έγινε, και περιμένουμε τον δήμο να δημοσιεύσει το υλικό της.',
    transcribing: 'Το υλικό δημοσιεύτηκε, και η συνεδρίαση απομαγνητοφωνείται αυτόματα μέσα σε λίγες ώρες.',
    review: 'Η αυτόματη απομαγνητοφώνηση είναι διαθέσιμη, και η ομάδα μας την ελέγχει. Οι συνόψεις έρχονται μετά τον έλεγχο.',
    complete: 'Η συνεδρίαση είναι έτοιμη: απομαγνητοφώνηση, θέματα, συνόψεις και τοποθετήσεις. Οι έτοιμες συνεδριάσεις δεν έχουν σύμβολο.',
    archive: 'Η συνεδρίαση έγινε χωρίς να δημοσιευτεί υλικό. Υπάρχουν μόνο η ημερήσια διάταξη και οι αποφάσεις.',
    postponed: 'Η συνεδρίαση αναβλήθηκε. Μόλις ο δήμος ορίσει τη νέα συνεδρίαση, εμφανίζεται εκείνη, με την ημερομηνία που είχε αρχικά οριστεί.',
    cancelled: 'Η συνεδρίαση ακυρώθηκε και δεν έγινε. Μένει στη λίστα με την ημερήσια διάταξή της.',
    noRecording: 'Η συνεδρίαση έγινε χωρίς δημόσια μετάδοση: κεκλεισμένων των θυρών ή δια περιφοράς. Υπάρχουν η ημερήσια διάταξη και οι αποφάσεις.',
};

/** The seven stages, then the facts that replace a stage. */
const SYMBOLS: readonly PresentationKey[] = [...PUBLIC_MEETING_STAGES, 'postponed', 'cancelled', 'noRecording'];

/**
 * The symbols a meeting wears on its way through OpenCouncil: the very
 * chip the meeting pages show, and one sentence beside it. A two-column list,
 * so every sentence starts on the same line as its chip and wraps under
 * itself, not under the chip. The meeting page's strip links here, to
 * `oc-stage-<stage>`.
 */
export function MeetingStagesFlow() {
    return (
        <ul className="not-prose m-0 mt-4 list-none divide-y divide-border p-0">
            {SYMBOLS.map(stage => (
                <li
                    key={stage}
                    id={`oc-stage-${stage}`}
                    className="grid scroll-mt-24 grid-cols-1 gap-x-5 gap-y-1.5 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-start"
                >
                    {/* Boxed to the sentence's line height, so the chip centres on its first line. */}
                    <span className="flex h-5 items-center">
                        <MeetingStageChip stage={stage} />
                    </span>
                    <p className="m-0 text-sm leading-5 text-muted-foreground">{SENTENCE[stage]}</p>
                </li>
            ))}
        </ul>
    );
}
