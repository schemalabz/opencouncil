"use client"

import { useState } from 'react';
import { Loader2, LocateFixed } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface GeolocateButtonProps {
    onLocated: (coordinates: [number, number]) => void;
    /** Icon-only round variant for mobile. */
    compact?: boolean;
    className?: string;
}

/**
 * "Η τοποθεσία μου" — deliberately the map chrome's one Civic Flame object:
 * showing your own neighborhood is the screen's primary action.
 */
export function GeolocateButton({ onLocated, compact = false, className }: GeolocateButtonProps) {
    const t = useTranslations('map');
    const { toast } = useToast();
    const [isLocating, setIsLocating] = useState(false);

    const locate = () => {
        if (isLocating || typeof navigator === 'undefined' || !navigator.geolocation) return;
        setIsLocating(true);
        navigator.geolocation.getCurrentPosition(
            position => {
                setIsLocating(false);
                onLocated([position.coords.longitude, position.coords.latitude]);
            },
            () => {
                setIsLocating(false);
                toast({ description: t('locationDenied') });
            },
            { enableHighAccuracy: false, timeout: 10_000 },
        );
    };

    const IconComponent = isLocating ? Loader2 : LocateFixed;

    return (
        <button
            type="button"
            onClick={locate}
            aria-label={t('myLocation')}
            className={cn(
                'flex items-center justify-center gap-2 bg-[hsl(24,100%,50%)] font-medium text-white shadow-md transition-[filter] hover:brightness-105',
                compact ? 'h-11 w-11 rounded-full' : 'h-10 rounded-full px-4 text-sm',
                className,
            )}
        >
            <IconComponent className={cn('h-4 w-4', isLocating && 'animate-spin')} />
            {!compact && <span>{t('myLocation')}</span>}
        </button>
    );
}
