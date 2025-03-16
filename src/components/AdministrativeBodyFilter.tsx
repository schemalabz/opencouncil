import { AdministrativeBody } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { Button } from './ui/button';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PersonWithRelations } from '@/lib/db/people';

interface AdministrativeBodyFilterProps {
    administrativeBodies: AdministrativeBody[];
    selectedAdminBodyId: string | null;
    onSelectAdminBody: (adminBodyId: string | null) => void;
    personRelatedOnly?: boolean;
    person?: PersonWithRelations;
}

export function AdministrativeBodyFilter({
    administrativeBodies,
    selectedAdminBodyId,
    onSelectAdminBody,
    personRelatedOnly = false,
    person
}: AdministrativeBodyFilterProps) {
    const t = useTranslations('City');

    // Filter administrative bodies if personRelatedOnly is true and person is provided
    const filteredAdminBodies = personRelatedOnly && person
        ? administrativeBodies.filter(adminBody =>
            person.roles.some(role =>
                role.administrativeBodyId === adminBody.id
            )
        )
        : administrativeBodies;

    if (filteredAdminBodies.length === 0) {
        return null;
    }

    return (
        <motion.div
            className="flex flex-col items-center justify-center my-6 sm:my-8 px-2 sm:px-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            <h3 className="text-base font-medium text-muted-foreground mb-3 sm:mb-4 text-center">
                {t('filterByAdminBody')}
            </h3>
            <div className="flex flex-wrap justify-center gap-2 sm:gap-3 max-w-3xl mx-auto">
                <Button
                    variant={selectedAdminBodyId === null ? "default" : "outline"}
                    size="sm"
                    className={cn(
                        "min-w-[100px] sm:min-w-[120px] h-9 sm:h-10 px-3 sm:px-4 rounded-full shadow-sm mb-1 sm:mb-2 text-sm",
                        selectedAdminBodyId === null ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted/50"
                    )}
                    onClick={() => onSelectAdminBody(null)}
                >
                    {t('allAdministrativeBodies')}
                </Button>
                {filteredAdminBodies.map((adminBody) => (
                    <Button
                        key={adminBody.id}
                        variant={selectedAdminBodyId === adminBody.id ? "default" : "outline"}
                        size="sm"
                        className={cn(
                            "min-w-[100px] sm:min-w-[120px] h-9 sm:h-10 px-3 sm:px-4 rounded-full shadow-sm mb-1 sm:mb-2 text-sm",
                            selectedAdminBodyId === adminBody.id ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted/50"
                        )}
                        onClick={() => onSelectAdminBody(adminBody.id)}
                    >
                        {adminBody.name}
                    </Button>
                ))}
            </div>
        </motion.div>
    );
} 