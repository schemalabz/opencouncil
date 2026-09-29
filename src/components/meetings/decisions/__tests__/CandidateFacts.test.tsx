import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CandidateFacts } from '../CandidateFacts';
import messages from '../../../../../messages/el/admin.json';

const renderFacts = (props: Partial<React.ComponentProps<typeof CandidateFacts>>) => render(
    <NextIntlClientProvider locale="el" messages={{ admin: messages }}>
        <CandidateFacts publishDate="2026-07-24" declaredDate={null} meetingDate="2026-07-21"
            readStatus="ok" organizationLabel={null} proposal={null} {...props} />
    </NextIntlClientProvider>,
);

describe('CandidateFacts', () => {
    it('warns when the document states another meeting', () => {
        renderFacts({ declaredDate: '2026-07-14' });
        expect(screen.getByText(/δηλώνει τη συνεδρίαση της .*όχι αυτή/)).toBeInTheDocument();
    });
    it('does not warn when the stated meeting is this one', () => {
        renderFacts({ declaredDate: '2026-07-21' });
        expect(screen.queryByText(/όχι αυτή/)).not.toBeInTheDocument();
        expect(screen.getByText(/Η απόφαση δηλώνει τη συνεδρίαση της/)).toBeInTheDocument();
    });
    it('warns about an unread document and another organization', () => {
        renderFacts({ readStatus: 'unreadable', organizationLabel: 'ΔΗΜΟΣ ΑΛΛΟΣ' });
        expect(screen.getByText(/Δεν διαβάσαμε/)).toBeInTheDocument();
        expect(screen.getByText(/«ΔΗΜΟΣ ΑΛΛΟΣ»/)).toBeInTheDocument();
    });
    it('shows the resolver reasoning with its confidence', () => {
        renderFacts({ proposal: { confidence: 0.82, reasoning: 'Ίδιος τίτλος' } });
        expect(screen.getByText(/82%/)).toBeInTheDocument();
        expect(screen.getByText('Ίδιος τίτλος')).toBeInTheDocument();
    });
});
