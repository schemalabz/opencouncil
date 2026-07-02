import type { AdministrativeBodyType } from '@prisma/client';
import { rankLandingSubjects } from '../ranking';
import type { LandingSubject } from '../landingData';

// Baseline subject; each test overrides just the signal it exercises so every other
// signal is constant (z-score 0) and drops out of the blend.
const subj = (over: Partial<LandingSubject>): LandingSubject =>
    ({
        id: 'x',
        cityId: 'A',
        date: '2026-01-01T00:00:00.000Z',
        durationMin: 10,
        adminBodyType: 'council' as AdministrativeBodyType,
        where: 'Οδός Ερμού',
        ...over,
    } as LandingSubject);

const ids = (subjects: LandingSubject[]) => rankLandingSubjects(subjects).map((s) => s.id);

describe('rankLandingSubjects', () => {
    it('ranks more recent meetings first', () => {
        const older = subj({ id: 'older', date: '2026-01-01T00:00:00.000Z' });
        const newer = subj({ id: 'newer', date: '2026-06-01T00:00:00.000Z' });
        expect(ids([older, newer])).toEqual(['newer', 'older']);
    });

    it('ranks longer-discussed subjects first (all else equal)', () => {
        const short = subj({ id: 'short', durationMin: 1 });
        const long = subj({ id: 'long', durationMin: 90 });
        expect(ids([short, long])).toEqual(['long', 'short']);
    });

    it('prefers Δημοτικό Συμβούλιο over Δημοτική Κοινότητα', () => {
        const council = subj({ id: 'council', adminBodyType: 'council' as AdministrativeBodyType });
        const community = subj({ id: 'community', adminBodyType: 'community' as AdministrativeBodyType });
        expect(ids([community, council])).toEqual(['council', 'community']);
    });

    it('gives a located subject the edge over an identical unlocated one', () => {
        const located = subj({ id: 'located', where: 'Οδός Ερμού' });
        const unlocated = subj({ id: 'unlocated', where: '' });
        expect(ids([unlocated, located])).toEqual(['located', 'unlocated']);
    });

    it('lifts subjects from smaller municipalities (fewer subjects in the set)', () => {
        const big1 = subj({ id: 'big1', cityId: 'BIG' });
        const big2 = subj({ id: 'big2', cityId: 'BIG' });
        const small = subj({ id: 'small', cityId: 'SMALL' });
        // SMALL contributes one subject, BIG two → the SMALL subject surfaces first
        expect(rankLandingSubjects([big1, big2, small])[0].id).toBe('small');
    });

    it('is stable when every signal is equal', () => {
        const a = subj({ id: 'a' });
        const b = subj({ id: 'b' });
        expect(ids([a, b])).toEqual(['a', 'b']);
    });
});
