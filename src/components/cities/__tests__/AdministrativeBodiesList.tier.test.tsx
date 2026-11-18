import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import AdministrativeBodiesList from '@/components/cities/AdministrativeBodiesList';
import type { AdministrativeBodyWithSendSettings } from '@/lib/db/types';
import enMain from '../../../../messages/en.json';
import enAdmin from '../../../../messages/en/admin.json';
import enValidation from '../../../../messages/en/validation.json';

let mockSession: { user: { isSuperAdmin: boolean } } | null = null;
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: mockSession }) }));

const messages = { ...enMain, admin: enAdmin, validation: enValidation } as AbstractIntlMessages;
const fetchMock = jest.fn();

beforeAll(() => {
    global.fetch = fetchMock;
    global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    Element.prototype.hasPointerCapture = jest.fn(() => false);
    Element.prototype.releasePointerCapture = jest.fn();
    Element.prototype.scrollIntoView = jest.fn();
});

beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: 'b1' }) });
});

const BODY: AdministrativeBodyWithSendSettings = {
    id: 'b1', cityId: 'athens', name: 'Δημοτικό Συμβούλιο', name_en: 'City Council', type: 'council', tier: 'primary',
    youtubeChannelUrl: null, place: null, createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    notificationBehavior: 'NOTIFICATIONS_APPROVAL', showUnreviewedTranscript: true, diavgeiaUnitIds: [], documentSendSettings: [], decisionConventions: null,
};

function renderList(bodies: AdministrativeBodyWithSendSettings[] = []) {
    return render(
        <NextIntlClientProvider locale="en" messages={messages} onError={() => undefined}>
            <AdministrativeBodiesList cityId="athens" bodies={bodies} onUpdate={jest.fn()} />
        </NextIntlClientProvider>,
    );
}

// The type select comes first in the dialog, the tier select second.
async function choose(index: number, option: string) {
    const trigger = (await screen.findAllByRole('combobox'))[index];
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: option }));
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
}

function sentBody() {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    return JSON.parse(fetchMock.mock.calls[0][1].body);
}

async function openNew() {
    fireEvent.click(screen.getByRole('button', { name: /Add New/ }));
    fireEvent.change(await screen.findByPlaceholderText('Body Name'), { target: { value: 'Ζήρεια Α.Ε.' } });
    fireEvent.change(screen.getByPlaceholderText('Body Name (English)'), { target: { value: 'Ziria SA' } });
}

describe('the tier field of the body form for a superadmin (#829)', () => {
    beforeEach(() => { mockSession = { user: { isSuperAdmin: true } }; });
    afterAll(() => { mockSession = null; });

    it('follows the type on a new body, and sends the tier', async () => {
        renderList();
        await openNew();
        await choose(0, 'Municipal Youth Council');
        expect(screen.getAllByRole('combobox')[1]).toHaveTextContent('Secondary body');
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(sentBody()).toMatchObject({ type: 'youthCouncil', tier: 'secondary', notificationBehavior: 'NOTIFICATIONS_DISABLED' });
    });

    it('keeps a tier the admin chose when the type changes after it', async () => {
        renderList();
        await openNew();
        await choose(1, 'Secondary body');
        await choose(0, 'Municipal Committee');
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(sentBody()).toMatchObject({ type: 'committee', tier: 'secondary', notificationBehavior: 'NOTIFICATIONS_DISABLED' });
    });

    it('keeps a tier the admin chose, even the default one, when the type changes after it', async () => {
        renderList();
        await openNew();
        await choose(1, 'Secondary body');
        await choose(1, 'Primary body');
        await choose(0, 'Municipal Youth Council');
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(sentBody()).toMatchObject({ type: 'youthCouncil', tier: 'primary', notificationBehavior: 'NOTIFICATIONS_APPROVAL' });
    });

    it('keeps the stored tier of an existing body when its type changes', async () => {
        renderList([BODY]);
        fireEvent.click(screen.getByRole('button', { name: 'Edit Body' }));
        await choose(0, 'Municipal Youth Council');
        fireEvent.click(screen.getByRole('button', { name: 'Update' }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(sentBody()).toMatchObject({ type: 'youthCouncil', tier: 'primary', notificationBehavior: 'NOTIFICATIONS_APPROVAL' });
    });
});

describe('the body form for a city admin (#829)', () => {
    it('hides the tier field', async () => {
        renderList();
        await openNew();
        expect(screen.queryByText('Visibility')).not.toBeInTheDocument();
        expect(screen.queryByRole('option', { name: 'Secondary body' })).not.toBeInTheDocument();
    });

    it('sends no tier, so a new body takes the default of its type', async () => {
        renderList();
        await openNew();
        await choose(0, 'Municipal Youth Council');
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        const body = sentBody();
        expect(body).not.toHaveProperty('tier');
        expect(body).toMatchObject({ type: 'youthCouncil', notificationBehavior: 'NOTIFICATIONS_DISABLED' });
    });

    it('sends no tier for an existing body', async () => {
        renderList([BODY]);
        fireEvent.click(screen.getByRole('button', { name: 'Edit Body' }));
        await choose(0, 'Municipal Youth Council');
        fireEvent.click(screen.getByRole('button', { name: 'Update' }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(sentBody()).not.toHaveProperty('tier');
    });
});
