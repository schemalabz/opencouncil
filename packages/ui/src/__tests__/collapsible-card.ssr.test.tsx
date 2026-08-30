/** @jest-environment node */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { CollapsibleCard } from '../collapsible-card';

describe('CollapsibleCard server rendering', () => {
    const render = (props: Partial<React.ComponentProps<typeof CollapsibleCard>>) =>
        renderToStaticMarkup(
            <CollapsibleCard title="Απόφαση" {...props}>
                <p>Κείμενο κάρτας</p>
            </CollapsibleCard>
        );

    it('renders closed content into the markup when ssrContent is set', () => {
        const html = render({ ssrContent: true });
        expect(html).toContain('Κείμενο κάρτας');
        expect(html).toContain('data-state="closed"');
        expect(html).toContain('data-[state=closed]:hidden');
    });

    it('omits closed content without ssrContent', () => {
        const html = render({});
        expect(html).not.toContain('Κείμενο κάρτας');
    });

    it('renders open content without ssrContent when defaultOpen is set', () => {
        const html = render({ defaultOpen: true });
        expect(html).toContain('Κείμενο κάρτας');
        expect(html).toContain('data-state="open"');
    });
});
