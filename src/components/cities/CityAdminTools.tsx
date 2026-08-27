"use client";
import { City, CityMessage } from '@prisma/client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Code, Database } from 'lucide-react';
import FormSheet from '@/components/FormSheet';
import CityForm from '@/components/cities/CityForm';
import CityCreator from '@/components/cities/CityCreator';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Link } from '@/i18n/routing';
import { IS_DEV } from '@/lib/utils';
import { isOutOfNetwork } from '@/lib/cityStatus';
import { useToast } from '@/hooks/use-toast';
import { getLocalizedName } from '@/lib/formatters/name';
import { AdminStrip, adminToolClass } from '@/components/admin/AdminStrip';

type CityAdminToolsProps = {
    city: City;
    cityMessage: CityMessage | null;
    /** Resolved on the server, so the controls are right on first paint. */
    canEdit: boolean;
    isSuperAdmin: boolean;
    hasNoData: boolean;
};

/**
 * The city page's back-of-house strip: edit, widget, data import, reset.
 *
 * Parked in the band's top corner and marked with hazard stripes, because these
 * controls sit on a page most of whose visitors are citizens. The striping is
 * the cheapest honest signal that this row is not part of what they came for —
 * it reads as scaffolding rather than as product, at a glance and without a
 * label to translate.
 *
 * Faded on purpose: it has to be legible as a boundary without competing with
 * the city name beside it.
 */
export function CityAdminTools({ city, cityMessage, canEdit, isSuperAdmin, hasNoData }: CityAdminToolsProps) {
    const t = useTranslations('City');
    const locale = useLocale();
    const { toast } = useToast();
    const [isCityCreatorOpen, setIsCityCreatorOpen] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    const canImport = isSuperAdmin && (isOutOfNetwork(city.status) || hasNoData);
    const canReset = IS_DEV && isSuperAdmin && !isOutOfNetwork(city.status);
    if (!canEdit && !canImport && !canReset) return null;

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

    const toolClassName = adminToolClass;

    return (
        <AdminStrip className="w-full">
            {canEdit && (
                <>
                    <FormSheet
                        FormComponent={CityForm}
                        formProps={{ city, cityMessage }}
                        title={t('editCity')}
                        description={getLocalizedName(city, locale)}
                        type="edit"
                        triggerVariant="ghost"
                        triggerSize="sm"
                        triggerClassName={toolClassName}
                        // The form carries a boundary map and a nested bodies list;
                        // the sheet's default 384px column cannot hold either.
                        contentClassName="w-full sm:max-w-2xl" 
                    />
                    <Button asChild variant="ghost" size="sm" className={toolClassName}>
                        <Link href={`/${city.id}/widget`} className="hover:no-underline">
                            <Code className="w-3.5 h-3.5 mr-1.5" />
                            {t('widget')}
                        </Link>
                    </Button>
                </>
            )}
            {canImport && (
                <Sheet open={isCityCreatorOpen} onOpenChange={setIsCityCreatorOpen}>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="sm" className={toolClassName}>
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
            {canReset && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetCity}
                    disabled={isResetting}
                    className="h-8 rounded-[6px] px-2.5 text-xs text-destructive hover:!bg-destructive/10 hover:text-destructive"
                >
                    <Database className={`w-3.5 h-3.5 mr-1.5 ${isResetting ? 'animate-spin' : ''}`} />
                    Reset City
                </Button>
            )}
        </AdminStrip>
    );
}
