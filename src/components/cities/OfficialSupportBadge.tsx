import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { BadgeCheck, BadgeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CityStatus } from '@prisma/client';
import { isCustomer } from '@/lib/cityStatus';

type AuthorityType = 'municipality' | 'region';

interface OfficialSupportBadgeProps {
    status: CityStatus;
    authorityType: AuthorityType;
    cityId?: string;
    className?: string;
    size?: 'sm' | 'md' | 'lg';
}

export function OfficialSupportBadge({
    status,
    authorityType,
    cityId,
    className,
    size = 'md'
}: OfficialSupportBadgeProps) {
    const t = useTranslations('City');
    // Tighter than the default badge: this sits beside a 48px city name and must
    // read as a caption, not as a second heading.
    const sizeClasses = {
        sm: 'h-[22px] px-2 text-[11px] gap-1',
        md: 'h-6 px-2.5 text-[11px] gap-1.5',
        lg: 'h-7 px-3 text-xs gap-1.5'
    };

    const iconSizes = {
        sm: 'w-3 h-3',
        md: 'w-3.5 h-3.5',
        lg: 'w-4 h-4'
    };

    const officialSupport = isCustomer(status);

    const getSupportText = () => {
        // Athens credits its co-funding partner in the badge
        if (officialSupport && cityId === 'athens') {
            return t('supportBadgeOfficialAthens');
        }

        if (authorityType === 'municipality') {
            return officialSupport ? t('supportBadgeOfficialMunicipality') : t('supportBadgeUnofficialMunicipality');
        }
        return officialSupport ? t('supportBadgeOfficialRegion') : t('supportBadgeUnofficialRegion');
    };

    if (officialSupport) {
        return (
            <Badge
                className={cn(
                    // A soft wash ringed in the same hue, the way topic chips are
                    // built elsewhere in the app — quiet enough to sit under the
                    // city name, definite enough to read as a mark of standing.
                    'border-emerald-600/25 bg-emerald-600/[0.07] font-medium text-emerald-800 hover:bg-emerald-600/[0.07] dark:text-emerald-300',
                    sizeClasses[size],
                    className
                )}
            >
                <BadgeCheck className={cn(iconSizes[size], 'shrink-0 text-emerald-600')} />
                <span>{getSupportText()}</span>
            </Badge>
        );
    }

    // Not a warning — most municipalities are here without a formal agreement, and
    // the badge only states that. Neutral outline, no colour, no alarm icon.
    return (
        <Badge
            variant="outline"
            className={cn(
                'border-border font-normal text-muted-foreground',
                sizeClasses[size],
                className
            )}
        >
            <BadgeX className={cn(iconSizes[size], 'shrink-0 text-muted-foreground/50')} />
            <span>{getSupportText()}</span>
        </Badge>
    );
}
