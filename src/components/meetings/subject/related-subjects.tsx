'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { CollapsibleCard } from '@/components/ui/collapsible-card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, CalendarDays, Link, ServerCrash, AlignLeft } from 'lucide-react';
import { RelatedSubjectResult } from '@/lib/search/types';
import NextLink from 'next/link';
import { formatTimestamp } from '@/lib/formatters/time';

interface RelatedSubjectsProps {
    subjectId: string;
    cityId: string;
}

interface RelatedSubjectsData {
    sameBody: RelatedSubjectResult[];
    elsewhere: RelatedSubjectResult[];
}

function RelatedSubjectItem({ subject, locale }: { subject: RelatedSubjectResult, locale: string }) {
    const t = useTranslations('Subject.relatedSubjects');
    
    // Date formatting using native Intl if we have a valid date string
    const formattedDate = subject.meetingDate 
        ? new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(subject.meetingDate))
        : null;

    return (
        <div className="flex flex-col gap-2 py-3 border-b last:border-0 border-border">
            <div className="flex items-start justify-between gap-4">
                <NextLink
                    href={`/${subject.cityId}/meetings/${subject.meetingId}/subjects/${subject.id}`}
                    prefetch={false}
                    className="group"
                >
                    <h4 className="font-semibold text-base transition-colors group-hover:text-primary">
                        {locale === 'en' && subject.name_en ? subject.name_en : subject.name}
                    </h4>
                </NextLink>
                {subject.topicName && (
                    <Badge variant="outline" className="whitespace-nowrap flex gap-1.5" style={
                        subject.topicColor ? { borderColor: subject.topicColor, color: subject.topicColor } : {}
                    }>
                        {subject.topicName}
                    </Badge>
                )}
            </div>
            
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                {formattedDate && (
                    <div className="flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5" />
                        <span>{formattedDate}</span>
                    </div>
                )}
                
                {subject.adminBodyName && (
                    <div className="flex items-center gap-1.5">
                        <AlignLeft className="w-3.5 h-3.5" />
                        <span>{subject.adminBodyName}</span>
                    </div>
                )}

                {subject.cityName && (
                    <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{locale === 'en' && subject.cityNameEn ? subject.cityNameEn : subject.cityName}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

function SubjectListSkeleton() {
    return (
        <div className="space-y-4 py-2">
            {[1, 2, 3].map(i => (
                <div key={i} className="flex flex-col gap-2 py-3 border-b last:border-0 border-border">
                    <div className="flex justify-between gap-4">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-5 w-24" />
                    </div>
                    <div className="flex gap-4 mt-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-40" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function RelatedSubjects({ subjectId, cityId }: RelatedSubjectsProps) {
    const t = useTranslations('Subject.relatedSubjects');
    const locale = useLocale();
    const [data, setData] = useState<RelatedSubjectsData | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<boolean>(false);
    const [hasLoaded, setHasLoaded] = useState<boolean>(false);

    // Fetch data only when expanded for the first time
    const handleExpand = async () => {
        if (hasLoaded || loading) return;
        
        setLoading(true);
        setError(false);
        try {
            const res = await fetch(`/api/subjects/${subjectId}/related`);
            if (!res.ok) throw new Error('Failed to fetch');
            const result = await res.json();
            setData(result);
            setHasLoaded(true);
        } catch (e) {
            console.error('Failed to load related subjects:', e);
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    const hasResults = data && (data.sameBody.length > 0 || data.elsewhere.length > 0);

    return (
        <CollapsibleCard 
            title={t('title')} 
            icon={<Link className="w-4 h-4" />}
            onExpand={handleExpand}
        >
            <div className="pt-2">
                {loading && <SubjectListSkeleton />}
                
                {error && (
                    <div className="flex items-center gap-2 text-destructive py-4 text-sm bg-destructive/10 rounded-md px-3 border border-destructive/20">
                        <ServerCrash className="w-4 h-4" />
                        <span>{t('error')}</span>
                    </div>
                )}

                {hasLoaded && !loading && !error && !hasResults && (
                    <div className="text-sm text-muted-foreground py-4 text-center">
                        {t('noResults')}
                    </div>
                )}

                {hasLoaded && !loading && !error && data && (
                    <div className="space-y-6">
                        {data.sameBody.length > 0 && (
                            <section>
                                <h3 className="font-semibold text-base mb-3 text-muted-foreground sticky top-0 bg-background/95 backdrop-blur z-10 py-1 border-b">
                                    {t('sameBody')}
                                </h3>
                                <div>
                                    {data.sameBody.map(subject => (
                                        <RelatedSubjectItem key={subject.id} subject={subject} locale={locale} />
                                    ))}
                                </div>
                            </section>
                        )}
                        
                        {data.elsewhere.length > 0 && (
                            <section>
                                <h3 className="font-semibold text-base mb-3 text-muted-foreground sticky top-0 bg-background/95 backdrop-blur z-10 py-1 border-b">
                                    {t('elsewhere')}
                                </h3>
                                <div>
                                    {data.elsewhere.map(subject => (
                                        <RelatedSubjectItem key={subject.id} subject={subject} locale={locale} />
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                )}
            </div>
        </CollapsibleCard>
    );
}
