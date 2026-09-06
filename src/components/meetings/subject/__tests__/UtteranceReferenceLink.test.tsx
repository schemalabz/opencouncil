import React from 'react';
import { render } from '@testing-library/react';

jest.mock('../UtteranceExpansionContext', () => ({
    useUtteranceExpansion: () => ({ toggleExpansion: jest.fn(), isExpanded: () => true }),
}));
jest.mock('@/components/meetings/CouncilMeetingDataContext', () => ({
    useCouncilMeetingData: () => ({ meeting: { cityId: 'athens' } }),
}));
jest.mock('@/hooks/useUtteranceData', () => ({
    useUtteranceData: () => ({
        utterance: { id: 'utt-1' },
        utteranceIndex: 0,
        segment: { id: 'segment-1', speakerTag: { id: 'tag-1' }, utterances: [{ id: 'utt-1' }] },
    }),
}));
jest.mock('../UtteranceMiniTranscript', () => ({
    UtteranceMiniTranscript: () => <div data-testid="mini-transcript" />,
}));

import { UtteranceReferenceLink } from '../UtteranceReferenceLink';

describe('UtteranceReferenceLink', () => {
    // The expansion is block content. The reference sits in a text flow, so the
    // component must not wrap the link and the expansion in an inline element.
    it('renders the expansion as a sibling of the link, with no wrapper element', () => {
        const { container } = render(
            <UtteranceReferenceLink utteranceId="utt-1">κείμενο</UtteranceReferenceLink>
        );

        expect(Array.from(container.children).map((el) => el.tagName)).toEqual(['A', 'DIV']);
        expect(container.querySelector('[data-testid="mini-transcript"]')).not.toBeNull();
    });
});
