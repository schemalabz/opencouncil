import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DerivationDialog } from '../DerivationDialog';
import admin from '../../../../../messages/el/admin.json';
import { ISSUE_CODES } from '@/lib/derivation/types';
import { DERIVATION_STAGES, ISSUE_STAGES } from '@/lib/derivation/issueCatalogue';

/**
 * The real Greek catalogue, not a mock: the dialog's whole claim is that a code
 * cannot go missing from the explanation, and a mocked `t` would let a code
 * with no authored copy pass.
 */
const el = admin.decisionsPage;

const show = () =>
    render(
        <NextIntlClientProvider locale="el" messages={{ admin }}>
            <DerivationDialog open onOpenChange={() => undefined} />
        </NextIntlClientProvider>,
    );

/** The card of one step, found by the step's own name. */
const stageCard = (stage: typeof DERIVATION_STAGES[number]) => {
    const heading = screen.getByText(el.derivation.stages[stage].name);
    const card = heading.closest('section');
    if (!card) throw new Error(`no card for stage ${stage}`);
    return within(card);
};

describe('DerivationDialog', () => {
    it('explains every code the derivation can raise', () => {
        show();
        for (const code of ISSUE_CODES) {
            expect(screen.getAllByText(el.issues.codes[code]).length).toBeGreaterThan(0);
        }
    });

    it('lists a two-step code under both its steps, each pointing at the other', () => {
        show();
        expect(ISSUE_STAGES.NO_ROLL_CALL).toEqual(['presence', 'write']);
        const label = el.issues.codes.NO_ROLL_CALL;
        // Step 3 sends the reader to step 5 and step 5 back to step 3.
        expect(stageCard('presence').getByText(label)).toBeInTheDocument();
        expect(stageCard('presence').getByText('και στο βήμα 5')).toBeInTheDocument();
        expect(stageCard('write').getByText(label)).toBeInTheDocument();
        expect(stageCard('write').getByText('και στο βήμα 3')).toBeInTheDocument();
    });

    it('gives the write step no stated/derived strip — it persists, it does not read', () => {
        show();
        expect(stageCard('read').getAllByText(el.derivation.stated).length).toBe(1);
        expect(stageCard('write').queryByText(el.derivation.stated)).not.toBeInTheDocument();
        // A strip printed from a missing key renders as the dotted path itself.
        expect(screen.queryByText(/derivation\.stages\./)).not.toBeInTheDocument();
    });

});
