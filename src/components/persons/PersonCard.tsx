'use client'
import { Person, Party } from '@prisma/client';
import { useRouter } from '../../i18n/routing';
import { Card, CardContent } from "../ui/card";
import { useLocale } from 'next-intl';
import { PersonBadge } from './PersonBadge';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { PersonWithRelations } from '@/lib/db/people';

interface PersonCardProps {
    item: PersonWithRelations;
    editable: boolean;
    parties: Party[];
}

export default function PersonCard({ item: person, editable, parties }: PersonCardProps) {
    const router = useRouter();
    const locale = useLocale();

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
                </div>
            </CardContent>
        </Card>
    );
}
