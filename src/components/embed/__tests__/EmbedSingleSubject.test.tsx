import { render, screen } from '@testing-library/react';
import { EmbedSingleSubject } from '../EmbedSingleSubject';
import type { PublicSubject } from '@/lib/sharing/publicContent';
jest.mock('@/components/icon', () => ({ __esModule: true, default: () => null }));

const subject: PublicSubject = {
    id: 'historic', name: 'Η πλατεία', description: '**Πράσινο** και [δέντρα](https://example.com).', cityId: 'city', councilMeetingId: 'old_2020', topic: null, location: null,
    councilMeeting: { id: 'old_2020', cityId: 'city', name: 'Συνεδρίαση', name_en: 'Meeting', dateTime: new Date('2020-04-06T10:00:00Z'), administrativeBody: null, taskStatuses: [], city: { id: 'city', name: 'Αθήνα', name_en: 'Athens', timezone: 'Europe/Athens', realm: 'greece' } },
};

describe('one public subject in a third-party iframe', () => {
    it('renders its exact historical subject with plain summary and a new-tab source link', () => {
        render(<EmbedSingleSubject subject={subject} locale="en" baseUrl="https://example.test" summaryLabel="AI-generated summary" readLabel="Read the discussion" />);
        expect(screen.getByText('Η πλατεία')).toBeInTheDocument();
        expect(screen.getByText('Πράσινο και δέντρα.')).toBeInTheDocument();
        expect(screen.getByText('AI-generated summary')).toBeInTheDocument();
        const link = screen.getByRole('link', { name: 'Read the discussion' });
        expect(link).toHaveAttribute('href', 'https://example.test/en/city/old_2020/subjects/historic');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        expect(screen.getAllByRole('link')).toHaveLength(1);
    });
});
