import React from 'react';
import { fireEvent, render } from '@testing-library/react';

jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
jest.mock('@/lib/analytics/capture', () => ({ captureEvent: jest.fn() }));

import { captureEvent } from '@/lib/analytics/capture';
import { RelatedRecurrenceLink } from '../RelatedRecurrenceLink';

const captureMock = captureEvent as jest.MockedFunction<typeof captureEvent>;
const PROPS = { subjectId: 'seed', cityId: 'athens', meetingId: 'meeting-1', count: 3 };

beforeEach(() => captureMock.mockClear());

describe('RelatedRecurrenceLink', () => {
    // The strip is above the fold: its mount is its impression.
    it('reports its impression on mount, once', () => {
        const { rerender } = render(<RelatedRecurrenceLink {...PROPS} />);
        rerender(<RelatedRecurrenceLink {...PROPS} />);

        expect(captureMock.mock.calls).toEqual([
            ['related_recurrence_shown', { subject_id: 'seed', city_id: 'athens', meeting_id: 'meeting-1', count: 3 }],
        ]);
    });

    it('reports a click with the same count', () => {
        const { getByRole } = render(<RelatedRecurrenceLink {...PROPS} />);

        fireEvent.click(getByRole('link'));

        expect(captureMock).toHaveBeenLastCalledWith('subject_action', {
            action: 'open_related_recurrence', subject_id: 'seed', city_id: 'athens', meeting_id: 'meeting-1', count: 3,
        });
    });
});
