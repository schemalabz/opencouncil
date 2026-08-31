"use client";

import { Link } from '@/i18n/routing';
import { captureEvent } from '@/lib/analytics/capture';
import { bandAt, type BarBand } from '@/lib/utils/barTimeline';

/** The band under the clock while playing — the one derivation both now-playing surfaces share. */
export function nowBand(bands: BarBand[], time: number, isPlaying: boolean): BarBand | null {
    const idx = isPlaying ? bandAt(bands, time) : -1;
    return idx >= 0 ? bands[idx] : null;
}

/**
 * The subject link of a now-playing line: one href shape, one analytics
 * payload, wherever the line renders (desktop lane, phone readout).
 */
export function NowPlayingSubjectLink({ band, cityId, meetingId, className, children }: {
    band: BarBand;
    cityId: string;
    meetingId: string;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <Link
            href={`/${cityId}/${meetingId}/subjects/${band.subjectId}`}
            prefetch={false}
            onClick={() => captureEvent('subject_opened', {
                surface: 'playback_bar',
                subject_id: band.subjectId,
                city_id: cityId,
                meeting_id: meetingId,
            })}
            className={className}
        >
            {children}
        </Link>
    );
}
