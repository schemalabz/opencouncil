"use client"

import Image from 'next/image';
import { Building2, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { MapMunicipality } from '@/lib/map/types';

interface MunicipalitiesTabProps {
    municipalities: MapMunicipality[];
    subjectCountByCity: Map<string, number>;
    onMunicipalityClick: (municipality: MapMunicipality) => void;
    onRequestCity: (municipality: MapMunicipality) => void;
}

export function MunicipalitiesTab({
    municipalities,
    subjectCountByCity,
    onMunicipalityClick,
    onRequestCity,
}: MunicipalitiesTabProps) {
    const t = useTranslations('map');
    const supported = municipalities
        .filter(m => m.officialSupport)
        .sort((a, b) => (subjectCountByCity.get(b.id) ?? 0) - (subjectCountByCity.get(a.id) ?? 0));
    const petitioned = municipalities
        .filter(m => !m.officialSupport)
        .sort((a, b) => b.petitionCount - a.petitionCount);

    if (municipalities.length === 0) {
        return (
            <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-12">
                <p className="text-center text-sm text-muted-foreground">{t('noCitiesInView')}</p>
            </div>
        );
    }

    return (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {supported.length > 0 && (
                <>
                    <h3 className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('supportedGroup')}
                    </h3>
                    {supported.map(municipality => (
                        <button
                            key={municipality.id}
                            type="button"
                            onClick={() => onMunicipalityClick(municipality)}
                            className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/60"
                        >
                            <span className="relative h-8 w-8 shrink-0">
                                {municipality.logoImage ? (
                                    <Image src={municipality.logoImage} alt="" fill sizes="32px" className="object-contain" />
                                ) : (
                                    <Building2 className="h-8 w-8 text-muted-foreground" />
                                )}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-foreground">
                                    {municipality.name}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                    {t('meetingsCount', { count: municipality.meetingsCount })}
                                    {' · '}
                                    {t('subjectsOnMap', { count: subjectCountByCity.get(municipality.id) ?? 0 })}
                                </span>
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                    ))}
                </>
            )}

            {petitioned.length > 0 && (
                <>
                    <h3 className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('petitionedGroup')}
                    </h3>
                    {petitioned.map(municipality => (
                        <div
                            key={municipality.id}
                            className="flex w-full items-center gap-3 border-b border-border px-4 py-3"
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-foreground">
                                    {municipality.name}
                                </span>
                                {municipality.petitionCount > 0 && (
                                    <span className="block text-xs text-muted-foreground">
                                        {t('petitionCount', { count: municipality.petitionCount })}
                                    </span>
                                )}
                            </span>
                            <Button variant="outline" size="sm" onClick={() => onRequestCity(municipality)}>
                                {t('requestCity')}
                            </Button>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}
