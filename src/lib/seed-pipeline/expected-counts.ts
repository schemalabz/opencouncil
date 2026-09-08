import fs from 'fs';
import type { Client } from 'pg';
import { meetingSetSql, SubsetSpec } from './greenmask-config';
import { SelectedMeeting } from './manifest';
import { EXPECTED_COUNTS_SQL, Pin } from './tables';

/** The meetings the subset conditions select, with their body and whether a pin chose them. */
export async function selectedMeetings(client: Client, spec: SubsetSpec): Promise<SelectedMeeting[]> {
    const pinned = new Set(spec.pins.map((p) => `${p.cityId}/${p.meetingId}`));
    const { rows } = await client.query<{ cityId: string; id: string; administrativeBodyId: string | null }>(
        `SELECT m."cityId", m.id, m."administrativeBodyId" FROM public."CouncilMeeting" m WHERE (m."cityId", m.id) IN (${meetingSetSql(spec)}) ORDER BY 1, 2`,
    );
    return rows.map((r) => ({ cityId: r.cityId, meetingId: r.id, administrativeBodyId: r.administrativeBodyId, pinned: pinned.has(`${r.cityId}/${r.id}`) }));
}

/**
 * The pins that `verify` would reject, one message each: a pin that names no
 * meeting, or a meeting without a subject or without a speaker segment. The
 * content window skips such a meeting, but a pin bypasses the window.
 */
export async function pinProblems(client: Client, pins: Pin[]): Promise<string[]> {
    if (pins.length === 0) return [];
    const { rows } = await client.query<{ cityId: string; meetingId: string; found: boolean; hasSubject: boolean; hasSegment: boolean }>(`
        SELECT p.c AS "cityId", p.m AS "meetingId",
               EXISTS (SELECT 1 FROM public."CouncilMeeting" m WHERE (m."cityId", m.id) = (p.c, p.m)) AS found,
               EXISTS (SELECT 1 FROM public."Subject" s WHERE (s."cityId", s."councilMeetingId") = (p.c, p.m)) AS "hasSubject",
               EXISTS (SELECT 1 FROM public."SpeakerSegment" g WHERE (g."cityId", g."meetingId") = (p.c, p.m)) AS "hasSegment"
          FROM unnest($1::text[], $2::text[]) WITH ORDINALITY AS p(c, m, n)
         ORDER BY p.n`, [pins.map((pin) => pin.cityId), pins.map((pin) => pin.meetingId)]);
    return rows.flatMap((r) => {
        const key = `${r.cityId}/${r.meetingId}`;
        if (!r.found) return [`${key}: no such meeting`];
        const missing = [...(r.hasSubject ? [] : ['subject']), ...(r.hasSegment ? [] : ['speaker segment'])];
        return missing.length ? [`${key}: no ${missing.join(' and no ')}`] : [];
    });
}

/** Expected rows per table for these meetings, computed with explicit joins, independent of Greenmask. */
export async function expectedCounts(client: Client, meetings: SelectedMeeting[], sqlFile: string = EXPECTED_COUNTS_SQL): Promise<Record<string, number>> {
    // Drop first so a stale "sel" table of a different shape is never reused.
    await client.query('DROP TABLE IF EXISTS pg_temp.sel');
    await client.query('CREATE TEMP TABLE sel(c text, m text)');
    try {
        await client.query('INSERT INTO sel SELECT * FROM unnest($1::text[], $2::text[])', [
            meetings.map((meeting) => meeting.cityId),
            meetings.map((meeting) => meeting.meetingId),
        ]);
        const { rows } = await client.query<{ table: string; n: string }>(fs.readFileSync(sqlFile, 'utf8'));
        const counts: Record<string, number> = {};
        for (const row of rows) counts[row.table] = Number(row.n);
        return counts;
    } finally {
        await client.query('DROP TABLE IF EXISTS pg_temp.sel');
    }
}
