'use client'
import { useRouter } from '../../i18n/routing';
import { Card, CardContent } from "../ui/card";
import { PersonBadge } from './PersonBadge';
import { cn, filterActiveRoles } from '@/lib/utils';
import { PersonWithRelations } from '@/lib/db/people';
import { RoleDisplay } from './RoleDisplay';

interface PersonCardProps {
    item: PersonWithRelations;
    editable: boolean;
}

export default function PersonCard({ item: person, editable }: PersonCardProps) {
    const router = useRouter();
    const activeRoles = filterActiveRoles(person.roles);

    const handleClick = () => {
        router.push(`/${person.cityId}/people/${person.id}`);
    };

    return (
        <Card
            className={cn(
                "group relative h-full overflow-hidden transition-all duration-300",
                "hover:shadow-lg hover:shadow-[#a4c0e1]/20 cursor-pointer border-0"
            )}
            onClick={handleClick}
        >
            <CardContent className="relative h-full flex p-5 sm:p-6">
                {/* Avatar section */}
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 mr-4">
                    <PersonBadge
                        person={person}
                        size="lg"
                        short={true}
                        className="hover:bg-transparent p-0"
                        withBorder={false}
                    />
                </div>

                {/* Content section */}
                <div className="flex-1 min-w-0 flex flex-col justify-start space-y-2">
                    {/* Name */}
                    <h3 className="text-lg text-foreground/90 truncate">
                        {person.name}
                    </h3>

                    {/* Roles */}
                    {activeRoles.length > 0 && (
                        <div className="space-y-1">
                            <RoleDisplay
                                roles={activeRoles}
                                size="sm"
                                layout="inline"
                                showIcons={true}
                                borderless={true}
                                className="items-start"
                            />
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
