import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PresenceCard } from '../PresenceCard';
import { buildTimeline } from '../../timeline';
import type { MinutesData } from '@/lib/minutes/types';
import { committeeWithSubstitute, councilWithAbsentPresident } from '@/lib/minutes/__tests__/rollCallFixtures';
import admin from '../../../../../../messages/el/admin.json';
import adminEn from '../../../../../../messages/en/admin.json';

/** The card reads the roll call the way the page builds it, in Greek, so each line reads as the minutes print it. */
const renderCard = (data: MinutesData, locale: 'el' | 'en' = 'el') => render(
    <NextIntlClientProvider locale={locale} messages={{ admin: locale === 'el' ? admin : adminEn }}>
        <PresenceCard rollCall={buildTimeline(data).rollCall} />
    </NextIntlClientProvider>,
);

/** The text of the line a label opens («Πρόεδρος:», «Δήμαρχος:»), label included. */
const lineOf = (label: string) => screen.getByText(label).parentElement!.textContent;

describe('PresenceCard', () => {
    it('renders nothing when the minutes hold no roll call', () => {
        const { container } = renderCard({ ...committeeWithSubstitute(), absentMembers: null });
        expect(container).toBeEmptyDOMElement();
    });

    it('prints one line for a committee the mayor presides: «Πρόεδρος: X (Δήμαρχος)»', () => {
        renderCard(committeeWithSubstitute());
        expect(lineOf('Πρόεδρος:')).toBe('Πρόεδρος: Μαλτέζος Ιωάννης (Δήμαρχος)');
        expect(screen.queryByText('Δήμαρχος:')).not.toBeInTheDocument();
    });

    it('prints no mayor at all for a committee the mayor is not a member of', () => {
        const data = committeeWithSubstitute();
        data.councilComposition!.mayor = { name: 'Στεργίου Ανδρέας', personId: 'outsider', note: null };
        data.councilComposition!.president = { name: 'Πετσέλης Χρήστος', personId: 'm1' };
        renderCard(data);
        expect(lineOf('Πρόεδρος:')).toBe('Πρόεδρος: Πετσέλης Χρήστος');
        expect(screen.queryByText('Δήμαρχος:')).not.toBeInTheDocument();
        expect(screen.queryByText(/Στεργίου/)).not.toBeInTheDocument();
    });

    it('prints a council\'s mayor on a line of their own with the minutes\' note, and counts the president in the ΣΥΝΘΕΣΗ', () => {
        renderCard(councilWithAbsentPresident());
        expect(lineOf('Δήμαρχος:')).toBe('Δήμαρχος: Ρούσσος Σίμος (αποχώρησε από το 4ο θέμα)');
        expect(lineOf('Πρόεδρος:')).toBe('Πρόεδρος: Καραγιάννη Τάνια — απούσα');
        expect(screen.getByText('1 παρόντες από 3')).toBeInTheDocument();
        expect(lineOf('1 απόντες:')).toBe('1 απόντες: Λαμπρόπουλος Παναγιώτης');
    });

    it('prints the absent mark in the gender of the person on the line', () => {
        const data = councilWithAbsentPresident();
        data.councilComposition!.mayor!.note = null;
        data.absentMembers = [...data.absentMembers!, { personId: 'mayor', name: 'Ρούσσος Σίμος', party: null, isPartyHead: false, role: null }];
        renderCard(data);
        expect(lineOf('Δήμαρχος:')).toBe('Δήμαρχος: Ρούσσος Σίμος — απών');
        expect(lineOf('Πρόεδρος:')).toBe('Πρόεδρος: Καραγιάννη Τάνια — απούσα');
    });

    it('prints the mayor\'s note after «(Δήμαρχος)» on a committee the mayor presides, when no document names who presided', () => {
        const data = committeeWithSubstitute();
        data.councilComposition!.mayor!.note = 'ΑΠΩΝ, προσήλθε από το 3ο θέμα';
        const composition = data.councilComposition!;
        data.absentMembers = [...data.absentMembers!, composition.members.find(m => m.personId === composition.mayor!.personId)!];
        renderCard(data);
        expect(lineOf('Πρόεδρος:')).toBe('Πρόεδρος: Μαλτέζος Ιωάννης (Δήμαρχος) (ΑΠΩΝ, προσήλθε από το 3ο θέμα)');
        expect(lineOf('Απόντα μέλη (2):')).toBe('Απόντα μέλη (2): Μαλτέζος Ιωάννης (Πρόεδρος, Δήμαρχος), Κολεβέντης Φώτιος');
    });

    it('names who presided first when the mayor who presides was absent, and lists the mayor as absent with the office', () => {
        const data = committeeWithSubstitute();
        data.councilComposition!.mayor!.note = 'ΑΠΩΝ';
        data.councilComposition!.presidedBy = { name: 'Πετσέλης Χρήστος', personId: 'm1' };
        const composition = data.councilComposition!;
        data.absentMembers = [...data.absentMembers!, composition.members.find(m => m.personId === composition.mayor!.personId)!];
        renderCard(data);
        expect(lineOf('Πρόεδρος:')).toBe('Πρόεδρος: Πετσέλης Χρήστος (λόγω απουσίας του Προέδρου, Δημάρχου Μαλτέζος Ιωάννης)');
        expect(lineOf('Απόντα μέλη (2):')).toBe('Απόντα μέλη (2): Μαλτέζος Ιωάννης (Πρόεδρος, Δήμαρχος), Κολεβέντης Φώτιος');
    });

    it('names who presided on a council whose president was absent, in Greek and in English', () => {
        const data = councilWithAbsentPresident();
        data.councilComposition!.presidedBy = { name: 'Παπαγιαννάκη Νίκη', personId: 'p3' };
        const { unmount } = renderCard(data);
        expect(lineOf('Πρόεδρος:')).toBe('Πρόεδρος: Παπαγιαννάκη Νίκη (λόγω απουσίας της Προέδρου Καραγιάννη Τάνια)');
        expect(lineOf('2 απόντες:')).toBe('2 απόντες: Καραγιάννη Τάνια (Πρόεδρος), Λαμπρόπουλος Παναγιώτης');
        expect(screen.getByText('1 παρόντες από 3')).toBeInTheDocument();
        unmount();
        renderCard(data, 'en');
        expect(lineOf('President:')).toBe('President: Παπαγιαννάκη Νίκη (in the absence of the president, Καραγιάννη Τάνια)');
        expect(lineOf('2 absent:')).toBe('2 absent: Καραγιάννη Τάνια (president), Λαμπρόπουλος Παναγιώτης');
    });

    it('names the substitute who sat in, among the members present', () => {
        renderCard(committeeWithSubstitute());
        expect(screen.getByText('4 παρόντα μέλη')).toBeInTheDocument();
        expect(lineOf('Αναπληρωματικά μέλη (1):')).toBe('Αναπληρωματικά μέλη (1): Δημάκης Γιώργος');
        expect(lineOf('Απόντα μέλη (1):')).toBe('Απόντα μέλη (1): Κολεβέντης Φώτιος');

        fireEvent.click(screen.getByText('Περισσότερα'));
        expect(lineOf('Παρόντα μέλη (4)')).toBe('Παρόντα μέλη (4) Μαλτέζος Ιωάννης, Πετσέλης Χρήστος, Λιόλιος Αντώνης, Δημάκης Γιώργος (αναπλ. μέλος)');

        fireEvent.click(screen.getByText('Λιγότερα'));
        expect(screen.queryByText('Παρόντα μέλη (4)')).not.toBeInTheDocument();
    });
});
