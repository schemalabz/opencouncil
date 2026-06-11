"use client";

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Re-fetches the server component's data via `router.refresh()`. The
 * transition's pending flag drives the spinner so the page stays interactive
 * while the refresh is in flight.
 */
export function RefreshButton() {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    return (
        <Button
            onClick={() => startTransition(() => router.refresh())}
            variant="outline"
            disabled={isPending}
        >
            <RefreshCw className={`h-4 w-4 mr-2 ${isPending ? 'animate-spin' : ''}`} />
            Refresh
        </Button>
    );
}
