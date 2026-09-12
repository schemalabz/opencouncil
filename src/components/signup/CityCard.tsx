'use client';

import Image from 'next/image';
import { useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { surfaceCardClass } from '@/components/ui/surface-card';
import { getLocalizedMunicipalityName } from '@/lib/formatters/name';
import { cn } from '@/lib/utils';

/** The fields a card or a row needs to name a municipality and show its seal. */
export interface CityIdentity {
    id: string;
    name: string;
    name_en: string | null;
    name_municipality: string;
    name_municipality_en: string | null;
    logoImage: string | null;
}

/**
 * The municipality a flow is about, already chosen: its seal, its name, one
 * line of status, and the way back to choosing another.
 */
export function CityCard({
    city,
    status,
    changeHref,
    changeLabel,
    className,
}: {
    city: CityIdentity;
    status?: React.ReactNode;
    changeHref: string;
    changeLabel: string;
    className?: string;
}) {
    const locale = useLocale();
    return (
        <div className={cn(surfaceCardClass, 'flex items-center gap-3 px-3.5 py-3', className)}>
            <CitySeal name={city.name} logoImage={city.logoImage} />
            <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-tight">{getLocalizedMunicipalityName(city, locale)}</span>
                {status && <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">{status}</span>}
            </span>
            <Link
                href={changeHref}
                className="-my-3 inline-flex min-h-11 items-center whitespace-nowrap pl-3 text-[13px] text-[hsl(var(--orange-deep))] hover:no-underline"
            >
                {changeLabel}
            </Link>
        </div>
    );
}

/** A municipality's seal, or its initial where none is stored. */
export function CitySeal({ name, logoImage, size = 40 }: { name: string; logoImage: string | null; size?: number }) {
    if (logoImage) {
        return (
            <Image
                src={logoImage}
                alt=""
                width={size}
                height={size}
                className="shrink-0 rounded-full object-contain"
                style={{ width: size, height: size }}
            />
        );
    }
    return (
        <span
            className="flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
            style={{ width: size, height: size, fontSize: size * 0.4 }}
            aria-hidden
        >
            {name.charAt(0)}
        </span>
    );
}
