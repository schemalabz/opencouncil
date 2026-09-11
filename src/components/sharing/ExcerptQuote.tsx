import type { ExcerptRun } from '@/lib/sharing/excerptSelector';

export function groupExcerptSpeakers(runs: ExcerptRun[]) {
    const groups: { key: string; speakerName: string | null; text: string }[] = [];
    for (const run of runs) {
        const key = run.personId ?? run.speakerTagId;
        const previous = groups[groups.length - 1];
        if (previous?.key === key) previous.text += ` ${run.text}`;
        else groups.push({ key, speakerName: run.speakerName, text: run.text });
    }
    return groups;
}

export function excerptQuoteText(runs: ExcerptRun[], unknownSpeaker: string) {
    return groupExcerptSpeakers(runs).map(group => `«${group.text}»\n— ${group.speakerName ?? unknownSpeaker}`).join('\n\n');
}

export function ExcerptQuote({ runs, unknownSpeaker, compact = false }: { runs: ExcerptRun[]; unknownSpeaker: string; compact?: boolean }) {
    return <div className={compact ? 'space-y-6' : 'space-y-9'}>
        {groupExcerptSpeakers(runs).map((group, index) => <figure key={`${group.key}-${index}`}>
            <blockquote className={compact ? 'whitespace-pre-wrap break-words text-lg font-medium leading-relaxed tracking-tight sm:text-xl' : 'whitespace-pre-wrap break-words text-2xl font-medium leading-[1.55] tracking-tight sm:text-3xl'}>
                <span className="text-[hsl(var(--orange-deep))] dark:text-[hsl(var(--orange))]">«</span>{group.text}<span className="text-[hsl(var(--orange-deep))] dark:text-[hsl(var(--orange))]">»</span>
            </blockquote>
            <figcaption className="mt-4 flex items-center gap-3 text-sm font-medium">
                <span className="h-px w-5 bg-[hsl(var(--orange))]" aria-hidden />{group.speakerName ?? unknownSpeaker}
            </figcaption>
        </figure>)}
    </div>;
}
