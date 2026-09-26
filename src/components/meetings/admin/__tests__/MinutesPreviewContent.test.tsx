import { render, screen } from '@testing-library/react';
import { MinutesPreviewContent } from '../MinutesPreviewContent';
import { committeeWithSubstitute, councilWithAbsentPresident } from '@/lib/minutes/__tests__/rollCallFixtures';
import type { MinutesMember } from '@/lib/minutes/types';

/** The on-screen minutes draw the same roll call as the DOCX; pinned markup for both body types. */
describe('MinutesPreviewContent roll call', () => {
    it('draws a committee the mayor presides, with a substitute sitting in', () => {
        const { container } = render(<MinutesPreviewContent data={committeeWithSubstitute()} />);
        expect(container.innerHTML).toMatchSnapshot();
    });

    it('draws a council with the mayor apart and the president absent', () => {
        const { container } = render(<MinutesPreviewContent data={councilWithAbsentPresident()} />);
        expect(container.innerHTML).toMatchSnapshot();
    });

    it('draws the lines the DOCX prints when the president was absent and someone else presided', () => {
        const data = councilWithAbsentPresident();
        data.councilComposition!.presidedBy = { name: 'Παπαγιαννάκη Νίκη', personId: 'p3' };
        render(<MinutesPreviewContent data={data} />);
        expect(screen.getByText('ΠΡΟΕΔΡΟΣ:').parentElement!.textContent)
            .toBe('ΠΡΟΕΔΡΟΣ: Παπαγιαννάκη Νίκη (λόγω απουσίας της ΠΡΟΕΔΡΟΥ Καραγιάννη Τάνια)');
        expect(screen.getByText(/απουσίαζαν οι/).textContent)
            .toBe('Κατά την έναρξη της συνεδρίασης απουσίαζαν οι Καραγιάννη Τάνια (ΠΡΟΕΔΡΟΣ), Λαμπρόπουλος Παναγιώτης (2)');
    });
});

describe('MinutesPreviewContent vote result from the phrase', () => {
    const member = (personId: string, name: string): MinutesMember =>
        ({ personId, name, party: null, isPartyHead: false, role: null });

    it('prints the phrase and still names the dissenters and the absent members', () => {
        const data = councilWithAbsentPresident();
        data.subjects = [{
            subjectId: 'subject-1',
            agendaItemIndex: 1,
            nonAgendaReason: null,
            withdrawn: false,
            name: 'Έγκριση προϋπολογισμού',
            discussedWith: null,
            discussedElsewhere: null,
            decision: null,
            presidedBy: null,
            attendance: null,
            voteResult: {
                forMembers: [],
                againstMembers: [member('p2', 'Βήτα Βασίλης')],
                abstainMembers: [member('p3', 'Γάμμα Γιώργος')],
                presentMembers: [member('p4', 'Δέλτα Δήμητρα')],
                didNotVoteMembers: [],
                absentMembers: [member('p5', 'Έψιλον Ελένη')],
                fromPhraseOnly: true,
                outcome: 'majority',
                phrase: 'Κατά πλειοψηφία με ΥΠΕΡ: 7 ψήφους, ΚΑΤΑ 1, ΛΕΥΚΟ 1',
            },
            discussion: { kind: 'none', seconds: 0, start: null },
            preDiscussionEntries: [],
            transcriptEntries: [],
        }];
        render(<MinutesPreviewContent data={data} />);
        expect(screen.getByText('Κατά πλειοψηφία')).toBeTruthy();
        expect(screen.getByText('ΚΑΤΑ (1):').parentElement!.textContent).toBe('ΚΑΤΑ (1): Βήτα Βασίλης');
        expect(screen.getByText('ΛΕΥΚΑ (1):').parentElement!.textContent).toBe('ΛΕΥΚΑ (1): Γάμμα Γιώργος');
        expect(screen.getByText('ΠΑΡΟΝΤΕΣ (1):').parentElement!.textContent).toBe('ΠΑΡΟΝΤΕΣ (1): Δέλτα Δήμητρα');
        expect(screen.getByText('ΑΠΟΝΤΕΣ (1):').parentElement!.textContent).toBe('ΑΠΟΝΤΕΣ (1): Έψιλον Ελένη');
        expect(screen.queryByText(/^ΥΠΕΡ \(/)).toBeNull();
    });
});
