"use client";

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { toggleNotisAction } from '@/app/[locale]/(admin)/admin/notis/actions';

export function NotisToggleButton({ userId, enabled }: { userId: string; enabled: boolean }) {
    const [pending, startTransition] = useTransition();

    return (
        <Button
            variant={enabled ? 'outline' : 'default'}
            size="sm"
            disabled={pending}
            onClick={() =>
                startTransition(async () => {
                    await toggleNotisAction(userId, !enabled);
                })
            }
        >
            {pending ? '…' : enabled ? 'Disable' : 'Enable'}
        </Button>
    );
}
