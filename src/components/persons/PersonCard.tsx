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

interface PersonCardProps {
    item: Person & { party: Party | null };
    editable: boolean;
    parties: Party[];
}

export default function PersonCard({ item: person, editable, parties }: PersonCardProps) {
    const t = useTranslations('PersonCard');
    const locale = useLocale();
    const router = useRouter();

    const handleClick = () => {
        router.push(`/${person.cityId}/people/${person.id}`);
    };

    const formatActiveDates = (from: Date | null, to: Date | null) => {
        if (!to && !from) return null;
        if (to && !from) return `${t('activeUntil')} ${formatDate(to)}`;
        if (from && to) return `${formatDate(from)} - ${formatDate(to)}`;
        return null;
    };

    return (
        <motion.div
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="h-full"
        >
            <Card
                className={cn(
                    "group relative h-full",
                    "hover:shadow-lg cursor-pointer",
                    "border-l-8 bg-background/60 backdrop-blur-sm",
                )}
                style={{
                    borderLeftColor: person.party?.colorHex || 'gray'
                }}
                onClick={handleClick}
            >
                <CardContent className="h-full p-6">
                    <div className="flex flex-col justify-center h-full">
                        <div className="flex flex-col gap-4">
                            <PersonBadge
                                person={{ ...person, party: person.party }}
                                className="!text-lg sm:!text-xl"
                                preferFullName
                                size="lg"
                            />

                            {formatActiveDates(person.activeFrom, person.activeTo) && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <CalendarClock className="w-4 h-4 flex-shrink-0" />
                                    <span>{formatActiveDates(person.activeFrom, person.activeTo)}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}

const formatDate = (date: Date | null) => {
    return date ? format(date, 'dd/MM/yyyy') : '-';
};
