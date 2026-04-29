import * as React from 'react';
import { Section } from '@react-email/components';
import { BaseTemplate } from '../components/BaseTemplate';

export interface ProductUpdateEmailProps {
    /**
     * Per-recipient HTML, already produced by `fillProductUpdateTemplate`
     * (placeholders {{userName}} / {{unsubscribeUrl}} substituted).
     */
    bodyHtml: string;
}

export const ProductUpdateEmail = ({
    bodyHtml,
}: ProductUpdateEmailProps): React.ReactElement => (
    <BaseTemplate>
        <Section style={{ padding: '0 8px' }}>
            <div
                style={{ color: '#374151', fontSize: '15px', lineHeight: '1.6' }}
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
        </Section>
    </BaseTemplate>
);

export default ProductUpdateEmail;
