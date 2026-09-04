import type { estypes } from '@elastic/elasticsearch';

jest.mock('@/env.mjs', () => ({ env: { ELASTICSEARCH_INDEX: 'test-index' } }));

import { buildRelatedSubjectsQuery, RELATED_MIN_SIMILARITY, RELATED_SUBJECTS_SIZE } from '../related';

const SEED = { id: 'subject-1', name: 'Κυκλοφοριακές ρυθμίσεις', cityId: 'athens', councilMeetingId: 'meeting-1' };
const REALM_CITIES = ['athens', 'chania', 'argos'];

function boolOf(query: estypes.SearchRequest): estypes.QueryDslBoolQuery {
    return query.query?.bool as estypes.QueryDslBoolQuery;
}

function cityTerms(query: estypes.SearchRequest): string[] {
    const filters = boolOf(query).filter as estypes.QueryDslQueryContainer[];
    const terms = filters.find(f => f.terms)?.terms as Record<string, string[]>;
    return terms.city_id;
}

describe('buildRelatedSubjectsQuery', () => {
    it('asks the semantic fields with the subject name and nothing else', () => {
        const query = buildRelatedSubjectsQuery(SEED, 'city', REALM_CITIES);
        const must = boolOf(query).must as estypes.QueryDslQueryContainer[];
        const disMax = must[0].dis_max as estypes.QueryDslDisMaxQuery;

        expect(must).toHaveLength(1);
        expect(disMax.tie_breaker).toBe(0);
        expect(disMax.queries.map(q => q.semantic)).toEqual([
            { field: 'name.semantic', query: SEED.name },
            { field: 'description.semantic', query: SEED.name },
        ]);
        expect(query.min_score).toBe(RELATED_MIN_SIMILARITY);
        expect(query.size).toBe(RELATED_SUBJECTS_SIZE);
        expect(query.index).toBe('test-index');
    });

    it('excludes the subject and every subject of its meeting', () => {
        const query = buildRelatedSubjectsQuery(SEED, 'city', REALM_CITIES);
        expect(boolOf(query).must_not).toEqual([
            { term: { id: 'subject-1' } },
            { term: { councilMeeting_id: 'meeting-1' } },
        ]);
    });

    it('only returns released subjects', () => {
        const query = buildRelatedSubjectsQuery(SEED, 'city', REALM_CITIES);
        expect(boolOf(query).filter).toContainEqual({ term: { meeting_released: true } });
    });

    it('the city scope stays inside the subject municipality', () => {
        expect(cityTerms(buildRelatedSubjectsQuery(SEED, 'city', REALM_CITIES))).toEqual(['athens']);
    });

    it('the other scope covers the rest of the realm and drops the home municipality', () => {
        expect(cityTerms(buildRelatedSubjectsQuery(SEED, 'other', REALM_CITIES))).toEqual(['chania', 'argos']);
    });

    it('keeps an empty city filter rather than dropping it, so no scope can reach another realm', () => {
        expect(cityTerms(buildRelatedSubjectsQuery(SEED, 'other', ['athens']))).toEqual([]);
        expect(cityTerms(buildRelatedSubjectsQuery(SEED, 'city', ['chania']))).toEqual([]);
    });
});
