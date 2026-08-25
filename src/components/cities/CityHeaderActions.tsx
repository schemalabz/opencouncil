"use client";
import { City, CityMessage } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Code, Database } from 'lucide-react';
import { motion } from 'framer-motion';
import FormSheet from '@/components/FormSheet';
import CityForm from '@/components/cities/CityForm';
import CityCreator from '@/components/cities/CityCreator';
import { NotificationCTAButton } from '@/components/cities/NotificationCTAButton';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Link } from '@/i18n/routing';
import { IS_DEV } from '@/lib/utils';
import { isOutOfNetwork, isPetitionable } from '@/lib/cityStatus';
import { useToast } from '@/hooks/use-toast';

type CityHeaderActionsProps = {
    city: City;
    cityMessage: CityMessage | null;
    /** Resolved on the server, so the editor controls are right on first paint. */
    canEdit: boolean;
    isSuperAdmin: boolean;
    hasNoData: boolean;
    hasNotifications: boolean;
};

/**
 * Every interactive control of the city identity band, in one island.
 *
 * Kept apart from the band itself so the band stays a Server Component: the
 * band is what the page is judged on, and it should not wait for hydration to
 * paint. Permission flags arrive as props rather than being resolved in an
 * effect, which is what used to make the editor controls appear a beat late.
 */
export function CityHeaderActions({
    city,
    cityMessage,
    canEdit,
    isSuperAdmin,
    hasNoData,
    hasNotifications,
}: CityHeaderActionsProps) {
    const t = useTranslations('City');
    const router = useRouter();
    const { toast } = useToast();
    const [isCityCreatorOpen, setIsCityCreatorOpen] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    const handleResetCity = async () => {
        if (!confirm('Are you sure you want to reset this city? This will delete ALL data (meetings, people, parties, roles, etc.) and set the city back to pending status. This action cannot be undone.')) {
            return;
        }

        setIsResetting(true);

        try {
            const response = await fetch(`/api/cities/${city.id}/reset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to reset city');
            }

            toast({ title: 'Success', description: 'City has been reset successfully' });
            window.location.reload();
        } catch (err) {
            toast({
                title: 'Error',
                description: err instanceof Error ? err.message : 'Failed to reset city',
                variant: 'destructive',
            });
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <div className="flex flex-col gap-3">
            {city.supportsNotifications && (
                <NotificationCTAButton
                    onClick={() => router.push(`/${city.id}/notifications`)}
                    isSubscribed={hasNotifications}
                />
            )}

            {isPetitionable(city.status) && (
                <Button
                    onClick={() => router.push(`/${city.id}/petition`)}
                    size="xl"
                    className="group transition-all duration-300"
                >
                    <div className="relative z-10 flex items-center gap-2">
                        <BadgeCheck className="w-5 h-5" />
                        <span className="font-medium">{t('petitionCta')}</span>
                    </div>
                    <motion.div
                        className="absolute inset-0 rounded-xl bg-[hsl(var(--orange))] opacity-0 group-hover:opacity-10 transition-opacity"
                        whileHover={{ boxShadow: "0 0 30px rgba(var(--orange), 0.5)" }}
                    />
                </Button>
            )}

            {(canEdit || isSuperAdmin) && (
                // Admin tools, deliberately quiet: they sit under a public CTA, so
                // they share one small ghost treatment rather than each arriving at
                // its own size and colour. Reset City keeps a destructive tint but
                // not a solid fill — it is a dev-only tool, not the loudest control
                // on the page.
                <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/70 bg-muted/30 p-1.5">
                    {canEdit && (
                        <>
                            <FormSheet
                                FormComponent={CityForm}
                                formProps={{ city, cityMessage }}
                                title={t('editCity')}
                                type="edit"
                                triggerVariant="ghost"
                                triggerSize="sm"
                                triggerClassName="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-background"
                            />
                            <Button asChild variant="ghost" size="sm" className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-background">
                                <Link href={`/${city.id}/widget`} className="hover:no-underline">
                                    <Code className="w-3.5 h-3.5 mr-1.5" />
                                    {t('widget')}
                                </Link>
                            </Button>
                        </>
                    )}
                    {isSuperAdmin && (isOutOfNetwork(city.status) || hasNoData) && (
                        <Sheet open={isCityCreatorOpen} onOpenChange={setIsCityCreatorOpen}>
                            <SheetTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-background">
                                    <Database className="w-3.5 h-3.5 mr-1.5" />
                                    Import Data
                                </Button>
                            </SheetTrigger>
                            <SheetContent className="max-w-4xl w-full sm:max-w-4xl overflow-y-auto">
                                <SheetHeader>
                                    <SheetTitle>City Creator</SheetTitle>
                                    <SheetDescription>
                                        Populate {city.name} with municipal data including parties, people, and roles.
                                    </SheetDescription>
                                </SheetHeader>
                                <div className="mt-6">
                                    <CityCreator
                                        cityId={city.id}
                                        cityName={city.name}
                                        onSuccess={() => window.location.reload()}
                                        onCancel={() => setIsCityCreatorOpen(false)}
                                    />
                                </div>
                            </SheetContent>
                        </Sheet>
                    )}
                    {IS_DEV && isSuperAdmin && !isOutOfNetwork(city.status) && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleResetCity}
                            disabled={isResetting}
                            className="h-8 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                            <Database className={`w-3.5 h-3.5 mr-1.5 ${isResetting ? 'animate-spin' : ''}`} />
                            Reset City
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
