'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import posthog from 'posthog-js';
import { OSEKTUTU_URL } from '@/lib/osektutu';

interface OsektutuBannerProps {
    /** The matched osektutu neighbourhood (e.g. "Kypseli"), for analytics. */
    neighbourhood: string;
    /** The OpenCouncil city the user just signed up for, for analytics. */
    cityId: string;
}

// OpenCouncil brand orange — hsl(24 100% 50%).
const ORANGE = '#ff6600';

/**
 * Promo banner shown on the notification signup confirmation step when one of the
 * user's selected locations falls inside an active osektutu neighbourhood. See #416.
 *
 * Order: logo → connected heading (the two sentences read as one thought) →
 * description → centered CTA → "already active" status badge at the end (only makes
 * sense once the reader knows what neighbourhood it refers to). The logo uses
 * `priority` so it renders eagerly — next/image's default lazy-loading was leaving
 * it blank below the fold inside the onboarding's nested scroll container.
 */
export function OsektutuBanner({ neighbourhood, cityId }: OsektutuBannerProps) {
    useEffect(() => {
        posthog.capture('osektutu_banner_shown', {
            city_id: cityId,
            neighbourhood,
        });
    }, [cityId, neighbourhood]);

    const handleClick = () => {
        posthog.capture('osektutu_banner_clicked', {
            city_id: cityId,
            neighbourhood,
        });
    };

    return (
        <div className="rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm">
            {/* Logo left, connected heading right — sized to match the small logo */}
            <div className="flex items-center gap-3">
                <Image
                    src="/osektutu-wordmark.png"
                    alt="OSEK TUTU"
                    width={52}
                    height={39}
                    priority
                    className="object-contain block shrink-0"
                />
                <div className="min-w-0">
                    <p className="text-xs font-medium leading-snug text-gray-700">
                        Συνδέθηκες με τον δήμο σου.
                    </p>
                    <p className="text-sm font-bold leading-snug text-gray-900">
                        Τώρα συνδέσου και με τη γειτονιά σου.
                    </p>
                </div>
            </div>

            <p className="mt-2 text-xs leading-snug text-gray-600">
                Στο OSEK TUTU βρίσκεις τους ανθρώπους που μένουν δίπλα σου και
                συναντιέστε από κοντά.
            </p>

            <div className="mt-2.5 flex justify-center">
                <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                    style={{ backgroundColor: '#fff0e6', color: ORANGE }}
                >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ORANGE }} />
                    Η γειτονιά σου είναι ήδη ενεργή
                </span>
            </div>

            <div className="mt-2.5 flex justify-center">
                <a
                    href={OSEKTUTU_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleClick}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold text-white shadow-md transition hover:opacity-90"
                    style={{ backgroundColor: '#1a1a1a' }}
                >
                    Μπες στη γειτονιά σου
                    <ArrowRight className="h-4 w-4 flex-shrink-0" />
                </a>
            </div>
        </div>
    );
}
