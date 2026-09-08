import type { Realm } from '@prisma/client';

const mockEnv = {
    NEXTAUTH_URL: 'https://opencouncil.gr',
    DISCORD_WEBHOOK_URL: 'https://discord.test/webhook',
    NEXT_PUBLIC_BUILD_COMMIT_SHA: 'abcdef1234567890',
};
jest.mock('@/env.mjs', () => ({ env: mockEnv }));

const mockGetCityRealm = jest.fn<Promise<Realm | null>, [string]>();
jest.mock('@/lib/db/cityRealm', () => ({ getCityRealm: (cityId: string) => mockGetCityRealm(cityId) }));

let requestHost: string | null = null;
jest.mock('next/headers', () => ({
    headers: async () => {
        if (requestHost === null) throw new Error('headers() outside a request scope');
        return new Map([['host', requestHost]]);
    },
}));

import {
    sendMeetingCreatedAdminAlert,
    sendTaskAdminAlert,
    sendPollDecisionsBatchCompletedAlert,
} from '../discord';
import { sendErrorAdminAlert } from '../discord-core';

/** The embed of the single Discord message the call under test posted. */
function postedEmbed() {
    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    return JSON.parse(fetchMock.mock.calls[0][1].body).embeds[0];
}

/** Every link target in the posted embed, in order. */
function postedLinks(): string[] {
    const fields = postedEmbed().fields as Array<{ value: string }>;
    return fields.flatMap(f => [...f.value.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]));
}

beforeEach(() => {
    mockEnv.NEXTAUTH_URL = 'https://opencouncil.gr';
    requestHost = null;
    // The shared fixture below is a French city; tests that need another realm say so.
    mockGetCityRealm.mockResolvedValue('france');
    global.fetch = jest.fn().mockResolvedValue({ ok: true, statusText: 'OK' });
});

describe('alert links', () => {
    const meeting = {
        cityName: 'Rennes',
        meetingName: 'Conseil municipal',
        meetingDate: new Date('2026-09-08T18:00:00Z'),
        meetingId: 'cm-1',
        cityId: 'rennes',
    };

    it("links to the realm domain of the alert's city, not the configured host", async () => {
        await sendMeetingCreatedAdminAlert(meeting);
        expect(postedLinks()).toEqual(['https://opencouncil.fr/rennes/cm-1']);
    });

    it('keeps a Greek city on the Greek domain', async () => {
        mockGetCityRealm.mockResolvedValue('greece');
        await sendMeetingCreatedAdminAlert({ ...meeting, cityId: 'athens' });
        expect(postedLinks()).toEqual(['https://opencouncil.gr/athens/cm-1']);
    });

    it('carries the sub-path through to the right realm', async () => {
        mockGetCityRealm.mockResolvedValue('cyprus');
        await sendTaskAdminAlert({
            status: 'failed',
            taskType: 'summarize',
            cityName: 'Λευκωσία',
            meetingName: 'Ολομέλεια',
            taskId: 't-1',
            cityId: 'vouli',
            meetingId: 'cm-2',
        });
        expect(postedLinks()).toEqual(['https://opencouncil.cy/vouli/cm-2/admin']);
    });

    it('links each meeting of a batch to its own realm', async () => {
        const realmOf: Record<string, Realm> = { athens: 'greece', nis: 'serbia', rennes: 'france' };
        mockGetCityRealm.mockImplementation(async cityId => realmOf[cityId] ?? null);
        const meetingResult = {
            matches: 1, reassignments: 0, conflicts: 0, extractions: 0,
            unplaced: 0, suggested: 0, unmatchedSubjects: 0, readIssues: 0,
            status: 'succeeded' as const,
        };
        await sendPollDecisionsBatchCompletedAlert({
            succeededCount: 3, failedCount: 0, totalMatches: 3, totalReassignments: 0,
            totalConflicts: 0, totalExtractions: 0, totalUnplaced: 0, totalSuggested: 0,
            totalUnmatchedSubjects: 0, totalReadIssues: 0,
            meetingBreakdown: [
                { ...meetingResult, cityId: 'athens', meetingId: 'a-1' },
                { ...meetingResult, cityId: 'nis', meetingId: 'n-1' },
                { ...meetingResult, cityId: 'rennes', meetingId: 'r-1', status: 'failed', error: 'boom' },
            ],
        });
        expect(postedLinks()).toEqual([
            'https://opencouncil.gr/athens/a-1/decisions',
            'https://opencouncil.rs/nis/n-1/decisions',
            'https://opencouncil.fr/rennes/r-1/admin',
        ]);
    });

    it('keeps a preview host, so alert links stay on the deployment under review', async () => {
        mockEnv.NEXTAUTH_URL = 'https://pr-42.opencouncil.dev';
        await sendMeetingCreatedAdminAlert(meeting);
        expect(postedLinks()).toEqual(['https://pr-42.opencouncil.dev/rennes/cm-1']);
    });

    it('still posts, on the configured host, when the realm lookup fails', async () => {
        mockGetCityRealm.mockRejectedValue(new Error('database is down'));
        await expect(sendMeetingCreatedAdminAlert(meeting)).resolves.toBeUndefined();
        expect(postedLinks()).toEqual(['https://opencouncil.gr/rennes/cm-1']);
    });
});

describe('error alert footer', () => {
    it('names the host the failing request arrived on', async () => {
        await sendErrorAdminAlert({ source: 'App Router render', error: 'boom', host: 'opencouncil.fr' });
        expect(postedEmbed().footer.text).toBe('commit abcdef1 · https://opencouncil.gr · via opencouncil.fr');
    });

    it("falls back to the current request's host when the caller passes none", async () => {
        requestHost = 'opencouncil.rs';
        await sendErrorAdminAlert({ source: 'App Router route', error: 'boom' });
        expect(postedEmbed().footer.text).toBe('commit abcdef1 · https://opencouncil.gr · via opencouncil.rs');
    });

    it('falls back to the deployment URL outside a request scope', async () => {
        await sendErrorAdminAlert({ source: 'Search', error: 'boom' });
        expect(postedEmbed().footer.text).toBe('commit abcdef1 · https://opencouncil.gr');
    });

    it('never lets a caller-supplied host displace the deployment identity', async () => {
        await sendErrorAdminAlert({ source: 'App Router render', error: 'boom', host: 'attacker.example' });
        const text = postedEmbed().footer.text;
        expect(text).toContain('https://opencouncil.gr');
        expect(text).toContain('via attacker.example');
    });

    it('falls back to the instance for an empty host, rather than dropping it', async () => {
        await sendErrorAdminAlert({ source: 'Search', error: 'boom', host: '' });
        expect(postedEmbed().footer.text).toBe('commit abcdef1 · https://opencouncil.gr');
    });

    it('caps a caller-supplied host at a hostname length', async () => {
        await sendErrorAdminAlert({ source: 'Search', error: 'boom', host: 'a'.repeat(400) });
        const text = postedEmbed().footer.text as string;
        expect(text).toContain(`via ${'a'.repeat(253)}`);
        expect(text).not.toContain('a'.repeat(254));
    });

    it('keeps the preview PR in the footer', async () => {
        mockEnv.NEXTAUTH_URL = 'https://pr-42.opencouncil.dev';
        await sendErrorAdminAlert({ source: 'App Router render', error: 'boom', host: 'pr-42.opencouncil.dev' });
        // The instance already names this host, so `via` adds nothing.
        expect(postedEmbed().footer.text).toBe('pr-42 · commit abcdef1 · https://pr-42.opencouncil.dev');
    });
});
