'use client'
import { Person, Party } from '@prisma/client';
import { useRouter } from '../../i18n/routing';
import { Card, CardContent } from "../ui/card";
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { format } from 'date-fns';
import { PersonBadge } from './PersonBadge';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { CalendarClock } from 'lucide-react';
import { PersonWithRelations } from '@/lib/getMeetingData';
import { filterActiveRoles } from '@/lib/utils';
import { useMemo } from 'react';

interface PersonCardProps {
    item: PersonWithRelations;
    editable: boolean;
    parties: Party[];
}

export default function PersonCard({ item: person, editable, parties }: PersonCardProps) {
    const t = useTranslations('Person');
    const router = useRouter();
    const locale = useLocale();

    const activeRoles = useMemo(() => filterActiveRoles(person.roles), [person.roles]);

    const handleClick = () => {
        router.push(`/${person.cityId}/people/${person.id}`);
    };

    return (
        <Card
            className={cn(
                "group relative h-full overflow-hidden transition-all duration-300",
                "hover:shadow-lg hover:scale-[1.01] cursor-pointer"
            )}
            onClick={handleClick}
        >
            <CardContent className="relative h-full flex flex-col p-4 sm:p-6">
                <div className="space-y-3 sm:space-y-4 flex-grow">
                    <PersonBadge
                        person={person}
                        size="lg"
                        preferFullName
                    />

                    {/* Active Roles */}
                    <div className="space-y-2">
                        {activeRoles.map((role) => (
                            <div key={role.id} className="text-sm text-muted-foreground">
                                {role.party && (
                                    <span>
                                        {role.party.name}
                                        {role.isHead && ` (${t('partyLeader')})`}
                                        {role.name && ` - ${role.name}`}
                                    </span>
                                )}
                                {role.city && (
                                    <span>
                                        {role.isHead ? t('mayor') : role.name}
                                    </span>
                                )}
                                {role.administrativeBody && (
                                    <span>
                                        {role.administrativeBody.name}
                                        {role.isHead && ` (${t('president')})`}
                                        {role.name && ` - ${role.name}`}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
