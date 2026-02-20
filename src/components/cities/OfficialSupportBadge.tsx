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
    const sizeClasses = {
        sm: 'text-xs px-2.5 py-1.5',
        md: 'text-sm px-3 py-2',
        lg: 'text-base px-4 py-2.5'
    };

    const iconSizes = {
        sm: 'w-3 h-3',
        md: 'w-4 h-4',
        lg: 'w-5 h-5'
    };

    const getSupportText = () => {
        // Hardcoded text for Athens
        if (officialSupport && cityId === 'athens') {
            return 'Με την υποστήριξη του δήμου και της ΔΑΕΜ Α.Ε.';
        }

        const entityText = authorityType === 'municipality' ? 'του δήμου' : 'της περιφέρειας';
        return officialSupport
            ? `Με την υποστήριξη ${entityText}`
            : `Χωρίς επίσημη υποστήριξη ${entityText}`;
    };

    if (officialSupport) {
        return (
            <Badge
                className={cn(
                    "gap-2 relative overflow-hidden border-0 text-white hover:shadow-md transition-shadow",
                    sizeClasses[size],
                    className
                )}
            >
                <span className="absolute inset-0 bg-gradient-to-r from-[#fc550a] to-[#a4c0e1] opacity-90"></span>
                <span className="relative z-10 flex items-center gap-2">
                    <BadgeCheck className={iconSizes[size]} />
                    <span>{getSupportText()}</span>
                </span>
            </Badge>
        );
    }

    return (
        <Badge
            variant="outline"
            className={cn(
                "gap-2 relative overflow-hidden bg-background hover:bg-accent/10 transition-colors",
                sizeClasses[size],
                className
            )}
        >
            <span className="absolute inset-0 bg-gradient-to-r from-[#fc550a] to-[#a4c0e1] opacity-10"></span>
            <span className="relative z-10 flex items-center gap-2 text-muted-foreground">
                <BadgeX className={iconSizes[size]} />
                <span>{getSupportText()}</span>
            </span>
        </Badge>
    );
}
