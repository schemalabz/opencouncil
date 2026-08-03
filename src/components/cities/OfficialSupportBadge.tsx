import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { BadgeCheck, BadgeX } from 'lucide-react';
import { cn } from '@/lib/utils';

type AuthorityType = 'municipality' | 'region';

interface OfficialSupportBadgeProps {
    officialSupport: boolean;
    authorityType: AuthorityType;
    cityId?: string;
    className?: string;
    size?: 'sm' | 'md' | 'lg';
}

export function OfficialSupportBadge({
    officialSupport,
    authorityType,
    cityId,
    className,
    size = 'md'
}: OfficialSupportBadgeProps) {
    const t = useTranslations('City');
    const sizeClasses = {
        sm: 'text-xs px-2 py-0.5',
        md: 'text-xs px-2 py-1',
        lg: 'text-sm px-2.5 py-1'
    };

    const iconSizes = {
        sm: 'w-3 h-3',
        md: 'w-3 h-3',
        lg: 'w-3.5 h-3.5'
    };

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
                    "gap-1.5 border-0 bg-muted hover:bg-muted text-muted-foreground font-normal",
                    sizeClasses[size],
                    className
                )}
            >
                <BadgeCheck className={cn(iconSizes[size], "shrink-0 text-green-600/50")} />
                <span>{getSupportText()}</span>
            </Badge>
        );
    }

    return (
        <Badge
            variant="outline"
            className={cn(
                "gap-1.5 border-muted-foreground/20 text-muted-foreground/60 font-normal",
                sizeClasses[size],
                className
            )}
        >
            <BadgeX className={cn(iconSizes[size], "text-muted-foreground/50")} />
            <span>{getSupportText()}</span>
        </Badge>
    );
}
