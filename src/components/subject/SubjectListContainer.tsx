import { useMemo, useState, useEffect, useCallback } from 'react';
import { Statistics } from '@/lib/statistics';
import { getStatisticsFor } from '@/lib/statistics';
import List, { BaseListProps } from '@/components/List';
import { SubjectCard } from '@/components/subject-card';
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

  useEffect(() => {
    async function fetchStatistics() {
      try {
        setIsStatsLoading(true);
        const statsPromises = subjects.map(subject =>
          getStatisticsFor({ subjectId: subject.id }, ["person", "party"])
        );
        const statsResults = await Promise.all(statsPromises);
        setStatistics(Object.fromEntries(
          subjects.map((subject, index) => [subject.id, statsResults[index]])
        ));
      } catch (err) {
        setStatsError(err instanceof Error ? err : new Error('Failed to fetch statistics'));
      } finally {
        setIsStatsLoading(false);
      }
    }

    if (subjects.length > 0) {
      fetchStatistics();
    }
  }, [subjects]);

  const ItemComponent = useCallback(({ item: subject }: { item: SearchResultLight }) => {
    const { people, parties } = cityData[subject.cityId] || { people: [], parties: [] };

    return (
      <SubjectCard
        subject={{
          ...subject,
          statistics: statistics[subject.id]
        }}
        city={subject.councilMeeting.city}
        meeting={subject.councilMeeting}
        parties={parties}
        persons={people}
        showContext={showContext}
        openInNewTab={openInNewTab}
      />
    );
  }, [cityData, statistics, showContext, openInNewTab]);

  if (isDataLoading || isStatsLoading) {
    return (
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
          <div className="text-destructive text-lg font-medium">Σφάλμα φόρτωσης</div>
          <span className="text-muted-foreground">
            {dataError?.message || statsError?.message || 'An error occurred'}
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