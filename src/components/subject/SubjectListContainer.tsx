import { useMemo, useState, useEffect, useCallback } from 'react';
import { getBatchStatisticsForSubjects, type Statistics } from '@/lib/statistics';
import List, { BaseListProps } from '@/components/List';
import { SubjectCard } from '@/components/subject-card';
import { SubjectRow } from './SubjectRow';
import { Skeleton } from '@/components/ui/skeleton';
import { PersonWithRelations } from '@/lib/db/people';
import { Party } from '@prisma/client';
import { SearchResultLight } from '@/lib/search/types';
import { useTranslations } from 'next-intl';

interface SubjectListContainerProps {
  subjects: SearchResultLight[];
  showContext?: boolean;
  translationKey?: string;
  openInNewTab?: boolean;
  /** `card` is the grid/carousel tile; `row` is the full-width line used by search. */
  variant?: 'card' | 'row';
  /**
   * A result was opened, with its position in `subjects`. Row variant only —
   * the caller adds whatever offset makes that a rank, since this list is one
   * page of a larger set.
   */
  onSubjectOpen?: (subject: SearchResultLight, index: number) => void;
}

// Helper function to fetch data from API
async function fetchFromApi<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch from ${url}`);
  }
  return response.json();
}

export function SubjectListContainer({ 
  subjects, 
  showContext = true,
  translationKey,
  openInNewTab = false,
  variant = 'card',
  onSubjectOpen,
  ...listProps
}: SubjectListContainerProps & BaseListProps) {
  // Get unique city IDs and meeting IDs from subjects
  const cityIds = useMemo(() => 
    [...new Set(subjects.map(subject => subject.cityId))],
    [subjects]
  );

  // State for city and meeting data
  const [cityData, setCityData] = useState<Record<string, { people: PersonWithRelations[]; parties: Party[] }>>({});
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [dataError, setDataError] = useState<Error | null>(null);
  const t = useTranslations(translationKey);
  const tCommon = useTranslations('Common');

  // Fetch city and meeting data
  useEffect(() => {
    async function fetchData() {
      try {
        setIsDataLoading(true);
        // Fetch all city and meeting data in parallel
        const dataPromises = cityIds.map(async (cityId) => {
          const [people, parties] = await Promise.all([
            fetchFromApi<PersonWithRelations[]>(`/api/cities/${cityId}/people`),
            fetchFromApi<Party[]>(`/api/cities/${cityId}/parties`),
          ]);
          return [cityId, { people, parties }] as const;
        });

        const results = await Promise.all(dataPromises);
        const cityDataMap: Record<string, { people: PersonWithRelations[]; parties: Party[] }> = {};

        results.forEach(([id, { people, parties }]) => {
          cityDataMap[id] = { people, parties };
        });

        setCityData(cityDataMap);
      } catch (err) {
        setDataError(err instanceof Error ? err : new Error('Failed to fetch data'));
      } finally {
        setIsDataLoading(false);
      }
    }

    if (cityIds.length > 0) {
      fetchData();
    } else {
      setCityData({});
      setIsDataLoading(false);
    }
  }, [cityIds]);

  // Fetch statistics for all subjects
  const [statistics, setStatistics] = useState<Record<string, Statistics>>({});
  const [isStatsLoading, setIsStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<Error | null>(null);

  // One batched call, not one per subject: getBatchStatisticsForSubjects groups
  // the whole page in 2-3 queries, where a call each was a Server Action round
  // trip per row — 15 of them on a page of search results.
  useEffect(() => {
    let live = true;

    async function fetchStatistics() {
      try {
        setIsStatsLoading(true);
        const statsMap = await getBatchStatisticsForSubjects(subjects.map(subject => subject.id));
        if (!live) return;
        setStatistics(Object.fromEntries(statsMap));
      } catch (err) {
        if (!live) return;
        setStatsError(err instanceof Error ? err : new Error('Failed to fetch statistics'));
      } finally {
        if (live) setIsStatsLoading(false);
      }
    }

    if (subjects.length > 0) {
      fetchStatistics();
    } else {
      // Nothing to fetch — but the flag starts true, so leaving it set would
      // hold the list on its skeleton forever.
      setStatistics({});
      setIsStatsLoading(false);
    }

    return () => { live = false; };
  }, [subjects]);

  const ItemComponent = useCallback(({ item: subject }: { item: SearchResultLight }) => {
    const { people, parties } = cityData[subject.cityId] || { people: [], parties: [] };
    const withStatistics = { ...subject, statistics: statistics[subject.id] };

    if (variant === 'row') {
      return (
        <SubjectRow
          subject={withStatistics}
          city={subject.councilMeeting.city}
          meeting={subject.councilMeeting}
          persons={people}
          showContext={showContext}
          openInNewTab={openInNewTab}
          onOpen={onSubjectOpen && (() => onSubjectOpen(subject, subjects.indexOf(subject)))}
        />
      );
    }

    return (
      <SubjectCard
        subject={withStatistics}
        city={subject.councilMeeting.city}
        meeting={subject.councilMeeting}
        parties={parties}
        persons={people}
        showContext={showContext}
        openInNewTab={openInNewTab}
        nameHighlight={subject.nameHighlight}
        descriptionHighlight={subject.descriptionHighlight}
      />
    );
  }, [cityData, statistics, showContext, openInNewTab, variant, onSubjectOpen, subjects]);

  if (isDataLoading || isStatsLoading) {
    return variant === 'row' ? (
      // As many placeholders as there are results, so the block doesn't visibly
      // shrink and regrow when this skeleton hands over to the caller's.
      <div className="flex flex-col gap-4">
        {Array.from({ length: Math.max(subjects.length, 1) }).map((_, i) => (
          <Skeleton key={i} className="h-[136px] w-full rounded-lg" />
        ))}
      </div>
    ) : (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex-none" style={{ width: listProps.carouselItemWidth || 320 }}>
            <Skeleton className="h-[280px] w-full rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  if (dataError || statsError) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-center space-y-2">
          <div className="text-destructive text-lg font-medium">{tCommon('loadingError')}</div>
          <span className="text-muted-foreground">
            {dataError?.message || statsError?.message || tCommon('genericError')}
          </span>
        </div>
      </div>
    );
  }

  return (
    <List<SearchResultLight>
      items={subjects}
      ItemComponent={ItemComponent}
      t={t}
      FormComponent={() => null}
      formProps={{}}
      editable={false}
      showSearch={false}
      layout="carousel"
      carouselItemWidth={320}
      carouselGap={16}
      {...listProps}
    />
  );
} 