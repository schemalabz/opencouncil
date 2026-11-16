import fs from 'fs';
import path from 'path';
import type { RegulationData } from '@/components/consultations/types';
import { describeEntity } from '@/components/consultations/entityDisplay';
import { validateRegulation } from '../../../scripts/lib/regulation-schema';
import { CONSULTATION_FIXTURE_JSON } from './consultationFixture';

const data: RegulationData = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', CONSULTATION_FIXTURE_JSON), 'utf8'));

describe('the regulation of the consultation fixture', () => {
    it('matches the regulation schema', () => {
        expect(validateRegulation(data)).toEqual({ valid: true, errors: [] });
    });

    it('is a regulation without a map', () => {
        expect(data.documentType).toBe('regulation');
        expect(data.regulation.every(item => item.type === 'chapter')).toBe(true);
    });

    it('gives every item an id that no other item has', () => {
        const ids = data.regulation.flatMap(item => item.type === 'chapter' ? [item.id, ...(item.articles ?? []).map(article => article.id)] : []);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('points every card to an item of the text', () => {
        const targets = (data.overview ?? []).flatMap(card => card.commentOn ? [card.commentOn] : []);
        expect(targets.length).toBeGreaterThan(0);
        for (const id of targets) {
            expect(describeEntity(data, [], id)).not.toBeNull();
        }
    });
});
