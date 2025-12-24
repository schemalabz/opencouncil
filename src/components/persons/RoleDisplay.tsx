import React from 'react';
import { Link } from '@/i18n/routing';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import { Star, Building, Users } from 'lucide-react';
import { RoleWithRelations } from '@/lib/db/types';

interface RoleDisplayProps {
    roles: RoleWithRelations[];
    size?: 'sm' | 'md' | 'lg';
    layout?: 'inline' | 'stacked' | 'compact';
    maxDisplay?: number;
    showIcons?: boolean;
    borderless?: boolean;
    className?: string;
}

const getRoleIcon = (role: RoleWithRelations) => {
    if (role.isHead) return Star;
    if (role.cityId) return Building;
    if (role.administrativeBodyId) return Users;
    return null;
};

const getRoleIconColor = (role: RoleWithRelations) => {
    if (role.isHead) return "text-[#fc550a]";
    if (role.cityId) return "text-[#a4c0e1]";
    if (role.administrativeBodyId) return "text-muted-foreground/70";
    return "text-muted-foreground/70";
};

const getRoleText = (role: RoleWithRelations) => {
    if (role.partyId && role.party) {
        const text = role.party.name;
        if (role.isHead) return `${text} (Επικεφαλής)`;
        if (role.name) return `${text} - ${role.name}`;
        return text;
    }

    if (role.cityId) {
        if (role.isHead) return 'Δήμαρχος';
        return role.name || 'Μέλος';
    }

    if (role.administrativeBodyId && role.administrativeBody) {
        let text = role.administrativeBody.name;
        if (role.name) text += ` - ${role.name}`;
        if (role.isHead) text += ' (Πρόεδρος)';
        return text;
    }

    return role.name || 'Μέλος';
};

const getRoleVariant = (role: RoleWithRelations) => {
    if (role.isHead) return 'default';
    if (role.partyId) return 'secondary';
    if (role.cityId) return 'outline';
    return 'outline';
};

export function RoleDisplay({
    roles,
    size = 'md',
    layout = 'inline',
    maxDisplay,
    showIcons = false,
    borderless = false,
    className
}: RoleDisplayProps) {
    if (!roles.length) return null;

    // Always show all roles, ignore maxDisplay for now
    const displayRoles = roles;

    const sizeClasses = {
        sm: 'text-xs gap-1',
        md: 'text-sm gap-1.5',
        lg: 'text-base gap-2'
    };

    const layoutClasses = {
        inline: 'flex flex-wrap items-center',
        stacked: 'flex flex-col',
        compact: 'flex flex-wrap items-center'
    };

    if (layout === 'compact' && roles.length > 0) {
        // For compact layout, show only the most important role + count
        const primaryRole = roles.find(r => r.isHead) || roles[0];

        return (
            <div className={cn("flex items-center", sizeClasses[size], className)}>
                {primaryRole.partyId && primaryRole.party ? (
                    <Link
                        href={`/${primaryRole.city?.id || primaryRole.party.cityId}/parties/${primaryRole.party.id}`}
                        className="no-underline hover:no-underline unstyled"
                    >
                        <Badge
                            variant="secondary"
                            className={cn(
                                "flex items-center gap-1.5 text-muted-foreground hover:bg-accent cursor-pointer font-normal",
                                borderless && "border-0 bg-muted/50 hover:bg-muted"
                            )}
                        >
                            <div className="flex items-center gap-1.5 w-6 flex-shrink-0">
                                <div
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: primaryRole.party.colorHex }}
                                />
                                <div className="w-3 h-3 flex items-center justify-center">
                                    {showIcons && primaryRole.isHead && (
                                        <Star className="w-3 h-3 text-[#fc550a]" />
                                    )}
                                </div>
                            </div>
                            <span className={cn(
                                "truncate",
                                borderless && "text-sm"
                            )}>
                                {primaryRole.party.name_short}
                                {primaryRole.isHead && ' (Επικ.)'}
                            </span>
                        </Badge>
                    </Link>
                ) : (
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 flex items-center justify-center flex-shrink-0">
                            {showIcons && primaryRole.isHead && (
                                <Star className="w-3 h-3 text-[#fc550a]" />
                            )}
                        </div>
                        <span className={cn(
                            "text-muted-foreground truncate",
                            borderless && "text-sm"
                        )}>
                            {getRoleText(primaryRole)}
                        </span>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={cn(layoutClasses[layout], sizeClasses[size], className)}>
            {displayRoles.map((role, index) => {
                const RoleIcon = showIcons ? getRoleIcon(role) : null;

                return (
                    <React.Fragment key={role.id}>

                        {role.partyId && role.party ? (
                            <Link
                                href={`/${role.city?.id || role.party.cityId}/parties/${role.party.id}`}
                                className="no-underline hover:no-underline unstyled"
                            >
                                <Badge
                                    variant={getRoleVariant(role)}
                                    className={cn(
                                        "flex items-center gap-1.5 text-muted-foreground relative overflow-hidden hover:bg-accent cursor-pointer font-normal",
                                        borderless && "border-0 bg-muted/50 hover:bg-muted",
                                        (role.isHead || role.cityId) && "bg-gradient-to-r from-[#fc550a]/10 to-[#a4c0e1]/10"
                                    )}
                                >
                                    {(role.isHead || role.cityId) && (
                                        <span className="absolute inset-0 bg-gradient-to-r from-[#fc550a]/5 to-[#a4c0e1]/5"></span>
                                    )}
                                    <span className="relative z-10 flex items-center gap-1.5">
                                        <div className="flex items-center gap-1.5 w-6 flex-shrink-0">
                                            <div
                                                className="w-2 h-2 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: role.party.colorHex }}
                                            />
                                            {RoleIcon ? (
                                                <RoleIcon className={cn("w-3 h-3", getRoleIconColor(role))} />
                                            ) : (
                                                <div className="w-3 h-3" />
                                            )}
                                        </div>
                                        {getRoleText(role)}
                                    </span>
                                </Badge>
                            </Link>
                        ) : (
                            <Badge
                                variant={getRoleVariant(role)}
                                className={cn(
                                    "flex items-center gap-1.5 text-muted-foreground relative overflow-hidden hover:bg-accent font-normal",
                                    borderless && "border-0 bg-muted/50 hover:bg-muted",
                                    (role.isHead || role.cityId) && "bg-gradient-to-r from-[#fc550a]/10 to-[#a4c0e1]/10"
                                )}
                            >
                                {(role.isHead || role.cityId) && (
                                    <span className="absolute inset-0 bg-gradient-to-r from-[#fc550a]/5 to-[#a4c0e1]/5"></span>
                                )}
                                <span className="relative z-10 flex items-center gap-1.5">
                                    <div className="w-3 h-3 flex items-center justify-center flex-shrink-0">
                                        {RoleIcon && <RoleIcon className={cn("w-3 h-3", getRoleIconColor(role))} />}
                                    </div>
                                    {getRoleText(role)}
                                </span>
                            </Badge>
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
}
