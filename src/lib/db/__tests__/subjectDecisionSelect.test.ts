/** @jest-environment node */
import { Prisma } from '@prisma/client';
import { subjectDecisionSelect } from '@/lib/db/types/decision';

describe('subjectDecisionSelect', () => {
    // A column added to Decision must be listed here, or it silently drops out of
    // every meeting, subject and search payload.
    it('lists every Decision column except the stored reading', () => {
        const columns = Object.values(Prisma.DecisionScalarFieldEnum).filter(c => c !== 'extraction');
        expect(Object.keys(subjectDecisionSelect).sort()).toEqual([...columns].sort());
    });
});
