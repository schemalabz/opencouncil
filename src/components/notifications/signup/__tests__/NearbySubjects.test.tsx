import { render, screen } from '@testing-library/react';
import { NearbySubjects } from '../NearbySubjects';

jest.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
    useLocale: () => 'en',
}));

const subject = {
    id: 's1',
    name: 'Parking space for disabled drivers',
    topic: { name: 'Συγκοινωνίες', name_en: 'Transportation', colorHex: '#3b82f6' },
    meetingDate: '2025-11-20T15:00:00.000Z',
    distanceMeters: 1442,
};

describe('NearbySubjects', () => {
    it('calls recent subjects recent and dates them by day and month', () => {
        render(<NearbySubjects state={{ status: 'ready', subjects: [subject], since: null, beyondPeriod: false }} timezone="Europe/Athens" />);

        expect(screen.getByText('nearby.eyebrow')).toBeInTheDocument();
        expect(screen.getByText('Transportation · 20 Nov')).toBeInTheDocument();
    });

    it('stops calling subjects recent when they come from before the period, and dates them with the year', () => {
        render(<NearbySubjects state={{ status: 'ready', subjects: [subject], since: null, beyondPeriod: true }} timezone="Europe/Athens" />);

        expect(screen.getByText('nearby.eyebrowOlder')).toBeInTheDocument();
        expect(screen.queryByText('nearby.eyebrow')).not.toBeInTheDocument();
        expect(screen.getByText(/Transportation · .*2025/)).toBeInTheDocument();
    });

    it('ends with the subjects, without a closing note', () => {
        render(<NearbySubjects state={{ status: 'ready', subjects: [subject], since: null, beyondPeriod: false }} timezone="Europe/Athens" />);

        expect(screen.queryByText('nearby.note')).not.toBeInTheDocument();
    });
});
