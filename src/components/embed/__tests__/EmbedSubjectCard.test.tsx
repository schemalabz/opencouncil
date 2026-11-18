import { render, screen } from '@testing-library/react';
import { EmbedSubjectCard } from '../EmbedSubjectCard';
import type { HotCardMeeting, HotCardSubject } from '@/lib/hotSubjectCards';
import { subjectCardStats } from '@/lib/subjectCardStats';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
jest.mock('@/components/TopicIcon', () => ({ TopicIcon: () => null }));
jest.mock('@/components/subject/SubjectCardFooter', () => ({ SubjectCardFooter: () => null }));

const subject = {
    id: 's1', name: 'Αδειοδότηση καταστήματος', description: 'Συζήτηση για την **άδεια** λειτουργίας.',
    topic: null, agendaItemIndex: 1, nonAgendaReason: null, withdrawn: false,
} as unknown as HotCardSubject;
const meeting = { id: 'm1', cityId: 'athens', name: 'Δημοτικό Συμβούλιο', dateTime: new Date('2026-01-15T16:00:00Z') } as unknown as HotCardMeeting;
const stats = subjectCardStats(undefined);

const renderCard = (s: HotCardSubject) => render(
    <EmbedSubjectCard subject={s} meeting={meeting} locationText={null} speakers={[]} stats={stats} locale="el" baseUrl="https://example.test" cityTimezone="Europe/Athens" />,
);

describe('EmbedSubjectCard', () => {
    it('labels the AI-written description', () => {
        renderCard(subject);
        expect(screen.getByText('aiGenerated')).toBeInTheDocument();
    });

    it('has no notice without a description', () => {
        renderCard({ ...subject, description: null } as unknown as HotCardSubject);
        expect(screen.queryByText('aiGenerated')).toBeNull();
    });
});
