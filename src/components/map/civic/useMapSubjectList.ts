import { useMemo } from 'react';
import { sortByRanking, type SubjectRanking } from '@/lib/map/ranking';
import type { MapSubject } from '@/lib/map/types';

export interface MapSubjectList {
    /** Ranked subjects to render in the panel list. */
    listSubjects: MapSubject[];
    /** Ranking (score + breakdown) per subject id, for the dev overlay. */
    rankingById: Map<string, SubjectRanking>;
    /** The open spiderfy fan's subjects, or null when none is open. */
    spiderfiedSubjects: MapSubject[] | null;
}

/**
 * The shared panel-list pipeline for both /map and the meeting map page:
 * resolve the open spiderfy fan (when any) against the full subject set, then
 * rank either that fan or the in-view subjects and expose the list plus a
 * per-id ranking lookup. Each surface computes `visibleSubjects` itself — the
 * "in view" rule differs (viewport intersection vs. always-listed for the one
 * meeting's municipality) — but everything downstream is identical.
 */
export function useMapSubjectList(
    allSubjects: MapSubject[],
    visibleSubjects: MapSubject[],
    spiderfiedIds: string[] | null,
): MapSubjectList {
    const spiderfiedSubjects = useMemo(() => {
        if (!spiderfiedIds) return null;
        const byId = new Map(allSubjects.map(subject => [subject.id, subject]));
        return spiderfiedIds
            .map(id => byId.get(id))
            .filter((subject): subject is MapSubject => Boolean(subject));
    }, [spiderfiedIds, allSubjects]);

    const rankings = useMemo(
        () => sortByRanking(spiderfiedSubjects ?? visibleSubjects),
        [spiderfiedSubjects, visibleSubjects],
    );
    const listSubjects = useMemo(() => rankings.map(ranking => ranking.subject), [rankings]);
    const rankingById = useMemo(
        () => new Map<string, SubjectRanking>(rankings.map(ranking => [ranking.subject.id, ranking])),
        [rankings],
    );

    return { listSubjects, rankingById, spiderfiedSubjects };
}
