import { render, screen } from '@testing-library/react';
import { EmbedMeetingSummary, type EmbedSummaryTranslations } from '../EmbedMeetingSummary';
import type { MeetingSummary, MeetingSummarySubject } from '@/lib/db/types';

const t: EmbedSummaryTranslations = {
    aiSummary: 'Αυτόματη σύνοψη',
    fullMeeting: 'Ολόκληρη η συνεδρίαση',
    noSubjects: 'Δεν υπάρχουν διαθέσιμα θέματα.',
    subjectsCount: (count) => `${count} θέματα`,
    speakersCount: (count) => `${count} ομιλητές`,
    hoursCount: (count) => `${count} ώρες`,
    minutesCount: (count) => `${count} λεπτά`,
};

function subject(id: string, name: string, contributions: number, description = 'Περίληψη'): MeetingSummarySubject {
    return {
        id,
        name,
        description,
        agendaItemIndex: null,
        nonAgendaReason: null,
        topic: { name: 'Δικαιοσύνη', name_en: 'Justice', colorHex: '#112233', icon: 'scale' },
        _count: { contributions },
    };
}

function summary(overrides: Partial<MeetingSummary> = {}): MeetingSummary {
    return {
        meeting: {
            id: 'apr6_2026',
            cityId: 'vouli',
            name: '25η συνεδρίαση',
            name_en: '25th session',
            dateTime: new Date('2026-04-06T10:00:00Z'),
            administrativeBody: { name: 'Ολομέλεια της Βουλής', name_en: 'Plenary' },
            subjects: [
                subject('quiet', 'Ήσυχο θέμα', 0),
                subject('penal', 'Ποινικός Κώδικας', 9),
                subject('waste', 'Διαχείριση αποβλήτων', 4),
            ],
        },
        durationSeconds: 3 * 3600 + 41 * 60,
        speakerCount: 28,
        subjectStartSeconds: { penal: 872 },
        ...overrides,
    };
}

describe('EmbedMeetingSummary', () => {
    it('shows the body, the meeting, the most discussed subjects and the stats', () => {
        render(<EmbedMeetingSummary summary={summary()} maxSubjects={2} locale="el" baseUrl="https://opencouncil.cy" translations={t} />);

        expect(screen.getByText('Ολομέλεια της Βουλής')).toBeInTheDocument();
        expect(screen.getByText(/25η συνεδρίαση, .*2026/)).toBeInTheDocument();
        expect(screen.getByText('Αυτόματη σύνοψη')).toBeInTheDocument();

        const cards = screen.getAllByRole('link', { name: /Ποινικός Κώδικας|Διαχείριση αποβλήτων|Ήσυχο θέμα/ });
        expect(cards.map(card => card.textContent)).toEqual([
            expect.stringContaining('Ποινικός Κώδικας'),
            expect.stringContaining('Διαχείριση αποβλήτων'),
        ]);
        expect(cards[0]).toHaveAttribute('href', 'https://opencouncil.cy/vouli/apr6_2026/subjects/penal');
        expect(cards[0]).toHaveTextContent('00:14:32');
        expect(cards[1]).not.toHaveTextContent(/\d\d:\d\d:\d\d/);

        expect(screen.getByText('3 ώρες 41 λεπτά')).toBeInTheDocument();
        expect(screen.getByText('3 θέματα')).toBeInTheDocument();
        expect(screen.getByText('28 ομιλητές')).toBeInTheDocument();

        const fullMeeting = screen.getByRole('link', { name: /Ολόκληρη η συνεδρίαση/ });
        expect(fullMeeting).toHaveAttribute('href', 'https://opencouncil.cy/vouli/apr6_2026');
        expect(fullMeeting).toHaveAttribute('target', '_blank');
    });

    it('prefixes links and picks English names for an English iframe', () => {
        render(<EmbedMeetingSummary summary={summary()} maxSubjects={1} locale="en" baseUrl="https://opencouncil.cy" translations={t} />);

        expect(screen.getByText('Plenary')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Ολόκληρη η συνεδρίαση/ }))
            .toHaveAttribute('href', 'https://opencouncil.cy/en/vouli/apr6_2026');
    });

    it('hides the stats that do not exist before transcription', () => {
        render(<EmbedMeetingSummary summary={summary({ durationSeconds: null, speakerCount: 0 })} maxSubjects={6} locale="el" baseUrl="https://opencouncil.cy" translations={t} />);

        expect(screen.queryByText(/λεπτά/)).not.toBeInTheDocument();
        expect(screen.queryByText(/ομιλητές/)).not.toBeInTheDocument();
        expect(screen.getByText('3 θέματα')).toBeInTheDocument();
    });

    it('keeps the header and link for a meeting without subjects', () => {
        const withoutSubjects = summary();
        withoutSubjects.meeting.subjects = [];
        render(<EmbedMeetingSummary summary={withoutSubjects} maxSubjects={6} locale="el" baseUrl="https://opencouncil.cy" translations={t} />);

        expect(screen.getByText('Δεν υπάρχουν διαθέσιμα θέματα.')).toBeInTheDocument();
        expect(screen.getByText('0 θέματα')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Ολόκληρη η συνεδρίαση/ })).toBeInTheDocument();
    });
});
