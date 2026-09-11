import { Info } from 'lucide-react';

export function TranscriptReviewNotice({ text }: { text: string }) {
    return <div role="note" className="flex items-start gap-2.5 rounded-xl border border-[hsl(var(--orange)/0.2)] bg-[hsl(var(--orange)/0.06)] px-4 py-3 text-sm leading-6 text-foreground/85">
        <Info className="mt-1 size-4 shrink-0 text-[hsl(var(--orange-deep))] dark:text-[hsl(var(--orange))]" aria-hidden />
        <p>{text}</p>
    </div>;
}
