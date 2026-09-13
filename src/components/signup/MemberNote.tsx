'use client';

import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The note a flow's first step shows a reader who is already in — on the
 * petition, or on the list. A green card with a check, not a grey line
 * under the municipality: the step's copy still invites them to join, so
 * the fact that they already have must be the first thing they read.
 */
export function MemberNote({ title, body, className }: { title: string; body: string; className?: string }) {
    return (
        <div
            role="status"
            className={cn('flex items-start gap-2.5 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3.5 py-3', className)}
        >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-emerald-900">{title}</span>
                <span className="text-[13px] leading-[1.45] text-emerald-900/80">{body}</span>
            </div>
        </div>
    );
}
