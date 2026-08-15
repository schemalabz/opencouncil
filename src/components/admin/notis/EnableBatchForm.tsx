"use client";

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { enableBatchAction } from '@/app/[locale]/(admin)/admin/notis/actions';

/**
 * «Enable next N» — random eligible users, clamped to however many remain.
 * ~200/day keeps intro templates ramping smoothly while Meta's messaging
 * tier climbs.
 */
export function EnableBatchForm({ remaining }: { remaining: number }) {
    const [n, setN] = useState(200);
    const [result, setResult] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Input
                type="number"
                min={1}
                value={n}
                onChange={(e) => setN(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                className="w-24"
                aria-label="Batch size"
            />
            <Button
                disabled={pending || remaining === 0}
                onClick={() =>
                    startTransition(async () => {
                        const res = await enableBatchAction(n);
                        setResult(
                            res.success
                                ? `Enabled ${res.enabled}; ${res.remaining} eligible users remain.`
                                : res.error ?? 'Failed',
                        );
                    })
                }
            >
                {pending ? 'Enabling…' : 'Enable next batch'}
            </Button>
            <span className="text-sm text-muted-foreground">
                {result ?? `${remaining} eligible users not yet enabled`}
            </span>
        </div>
    );
}
