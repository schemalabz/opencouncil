import * as React from 'react';
import { render } from '@react-email/render';

export async function renderReactEmailToHtml(component: React.ReactElement): Promise<string> {
    return render(component);
} 