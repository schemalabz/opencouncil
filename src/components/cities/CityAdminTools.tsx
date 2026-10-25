"use client";
import { City, CityMessage } from '@prisma/client';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Code, Database } from 'lucide-react';
import FormSheet from '@/components/FormSheet';
import CityForm from '@/components/cities/CityForm';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { IS_DEV } from '@/lib/utils';
import { isOutOfNetwork } from '@/lib/cityStatus';
import { useToast } from '@/hooks/use-toast';
import { getLocalizedName } from '@/lib/formatters/name';
import { AdminStrip, AdminToolButton, adminToolClass } from '@/components/admin/AdminStrip';

type CityAdminToolsProps = {
    city: City;
    cityMessage: CityMessage | null;
    /** Resolved on the server, so the controls are right on first paint. */
    canEdit: boolean;
    isSuperAdmin: boolean;
};

/**
 * The city page's back-of-house strip: edit, widget, reset.
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
export function CityAdminTools({ city, cityMessage, canEdit, isSuperAdmin }: CityAdminToolsProps) {
    const t = useTranslations('City');
    const locale = useLocale();
    const { toast } = useToast();
    const [isResetting, setIsResetting] = useState(false);

    const canReset = IS_DEV && isSuperAdmin && !isOutOfNetwork(city.status);
    if (!canEdit && !canReset) return null;

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
                        triggerClassName={adminToolClass}
                        // The form carries a boundary map and a nested bodies list;
                        // the sheet's default 384px column cannot hold either.
                        contentClassName="w-full sm:max-w-2xl" 
                    />
                    <AdminToolButton asChild>
                        <Link href={`/${city.id}/widget`} className="hover:no-underline">
                            <Code className="w-3.5 h-3.5 mr-1.5" />
                            {t('widget')}
                        </Link>
                    </AdminToolButton>
                </>
            )}
            {canReset && (
                <AdminToolButton
                    destructive
                    onClick={handleResetCity}
                    disabled={isResetting}
                >
                    <Database className={`w-3.5 h-3.5 mr-1.5 ${isResetting ? 'animate-spin' : ''}`} />
                    Reset City
                </AdminToolButton>
            )}
        </AdminStrip>
    );
}
