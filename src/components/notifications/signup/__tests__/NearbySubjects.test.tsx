import { render, screen } from '@testing-library/react';
import { NearbySubjects } from '../NearbySubjects';

jest.mock('@/i18n/routing', () => ({
    Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));
jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
    useLocale: () => 'en',
}));

const subject = {
    id: 's1',
    name: 'Parking space for disabled drivers',
    path: '/thira/nov20_2025/subjects/s1',
    topic: { name: 'Συγκοινωνίες', name_en: 'Transportation', colorHex: '#3b82f6' },
    meetingDate: '2025-11-20T15:00:00.000Z',
    distanceMeters: 1442,
};

describe('NearbySubjects', () => {
    it('calls recent subjects recent and dates them by day and month', () => {
        render(<NearbySubjects state={{ status: 'ready', subjects: [subject], since: null, beyondPeriod: false }} timezone="Europe/Athens" />);

        expect(screen.getByText('nearby.eyebrow')).toBeInTheDocument();
        expect(screen.getByText('Transportation')).toBeInTheDocument();
        expect(screen.getByText('20 Nov')).toBeInTheDocument();
    });

    it('stops calling subjects recent when they come from before the period, and dates them with the year', () => {
        render(<NearbySubjects state={{ status: 'ready', subjects: [subject], since: null, beyondPeriod: true }} timezone="Europe/Athens" />);

        expect(screen.getByText('nearby.eyebrowOlder')).toBeInTheDocument();
        expect(screen.queryByText('nearby.eyebrow')).not.toBeInTheDocument();
        expect(screen.getByText(/2025/)).toBeInTheDocument();
    });

    it('opens each subject on its own page in a new tab', () => {
        render(<NearbySubjects state={{ status: 'ready', subjects: [subject], since: null, beyondPeriod: false }} timezone="Europe/Athens" />);

        const link = screen.getByRole('link', { name: /Parking space for disabled drivers/ });
        expect(link).toHaveAttribute('href', '/thira/nov20_2025/subjects/s1');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        expect(link).toHaveTextContent('nearby.newTab');
    });

    it('keeps the date apart from the topic, so a long topic cannot push it out of view', () => {
        const long = { ...subject, topic: { ...subject.topic, name_en: 'Cleanliness, Waste and Recycling in Every Neighbourhood' } };
        render(<NearbySubjects state={{ status: 'ready', subjects: [long], since: null, beyondPeriod: true }} timezone="Europe/Athens" />);

        const topic = screen.getByText('Cleanliness, Waste and Recycling in Every Neighbourhood');
        const date = screen.getByText(/2025/);
        expect(topic).not.toContainElement(date);
        expect(date).toHaveClass('shrink-0');
        expect(topic).toHaveClass('truncate');
    });

    it('shows the date alone when a subject has no topic', () => {
        render(<NearbySubjects state={{ status: 'ready', subjects: [{ ...subject, topic: null }], since: null, beyondPeriod: false }} timezone="Europe/Athens" />);

        expect(screen.getByText('20 Nov')).toBeInTheDocument();
        expect(screen.queryByText('·')).not.toBeInTheDocument();
    });

    it('ends with the subjects, without a closing note', () => {
        render(<NearbySubjects state={{ status: 'ready', subjects: [subject], since: null, beyondPeriod: false }} timezone="Europe/Athens" />);

        expect(screen.queryByText('nearby.note')).not.toBeInTheDocument();
    });
});
