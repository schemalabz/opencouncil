"use client";
import { useTranslations } from 'next-intl';
import { BadgeCheck, BadgeX } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import type { CityStatus, Realm } from '@prisma/client';
import { isCustomer } from '@/lib/cityStatus';
import { hasExplainPage } from '@/lib/explain/availability';

type AuthorityType = 'municipality' | 'region';

interface OfficialSupportBadgeProps {
    status: CityStatus;
    authorityType: AuthorityType;
    cityId?: string;
    /** Decides whether the guide exists to link to — it is a Greek-realm page. */
    realm?: Realm;
    className?: string;
    size?: 'sm' | 'md' | 'lg';
}

/**
 * Whether the municipality is behind this page, said in two words.
 *
 * The standing is worth stating and not worth a sentence under the city's name:
 * the long form ran the width of the heading above it and read as a second
 * subtitle. Two words and a check carry it, and the sentence — plus who pays for
 * OpenCouncil, which is the question the badge actually raises — is one tap away.
 *
 * No wash and no ring: at caption size beside a 48px heading, the colour was
 * doing the shouting. The check keeps the hue; everything else is a caption.
 */
export function OfficialSupportBadge({
    status,
    authorityType,
    cityId,
    realm,
    className,
    size = 'md'
}: OfficialSupportBadgeProps) {
    const t = useTranslations('City');

    const textSizes = { sm: 'text-[11px]', md: 'text-[11px]', lg: 'text-xs' };
    const iconSizes = { sm: 'w-3 h-3', md: 'w-3.5 h-3.5', lg: 'w-4 h-4' };

    const officialSupport = isCustomer(status);

    // The sentence the chip used to carry, now the body of what it opens.
    const detail = () => {
        // Athens credits its co-funding partner.
        if (officialSupport && cityId === 'athens') return t('supportBadgeOfficialAthens');
        if (authorityType === 'municipality') {
            return officialSupport ? t('supportBadgeOfficialMunicipality') : t('supportBadgeUnofficialMunicipality');
        }
        return officialSupport ? t('supportBadgeOfficialRegion') : t('supportBadgeUnofficialRegion');
    };

    const Icon = officialSupport ? BadgeCheck : BadgeX;

    return (
        <Popover>
            <PopoverTrigger
                className={cn(
                    'inline-flex items-center gap-1.5 rounded-full text-muted-foreground transition-colors hover:text-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30',
                    textSizes[size],
                    className
                )}
            >
                <Icon
                    className={cn(
                        iconSizes[size],
                        'shrink-0',
                        officialSupport ? 'text-emerald-600' : 'text-muted-foreground/50',
                    )}
                    aria-hidden
                />
                {officialSupport ? t('supportBadgeShortOfficial') : t('supportBadgeShortUnofficial')}
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={6} className="w-64">
                <p className="flex gap-2 text-[13px] leading-snug">
                    <Icon
                        className={cn('mt-[3px] h-3.5 w-3.5 shrink-0',
                            officialSupport ? 'text-emerald-600' : 'text-muted-foreground/50')}
                        aria-hidden
                    />
                    <span>{detail()}</span>
                </p>
                {realm && hasExplainPage(realm) && (
                    <Link
                        href="/explain#oc-pricing"
                        className="mt-2 block border-t border-border pt-2 text-[12px] text-[hsl(var(--orange))]"
                    >
                        {t('supportBadgeLearnMore')}
                    </Link>
                )}
            </PopoverContent>
        </Popover>
    );
}
