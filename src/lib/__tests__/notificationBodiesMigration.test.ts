import fs from 'fs';
import path from 'path';
import { SECONDARY_BODY_TYPES } from '@/lib/utils/bodyTier';

/**
 * The Notis events view names the secondary types in SQL (#829): an event
 * of such a body reaches the followers of the body, nobody else. The list
 * cannot read the tier helper, so this pins the two to each other: a type
 * that joins the tier must join the view, through a new migration.
 */
const MIGRATION = path.join(__dirname, '../../../prisma/migrations/20261011120200_notification_preference_bodies/migration.sql');

describe('the followersOnly column of notis_meeting_events', () => {
    it('names exactly the secondary body types', () => {
        const sql = fs.readFileSync(MIGRATION, 'utf8');
        const match = sql.match(/ab\.type::text IN \(([^)]*)\)\) AS "followersOnly"/);
        expect(match).not.toBeNull();
        const listed = match![1].split(',').map((entry) => entry.trim().replace(/^'|'$/g, '')).sort();
        expect(listed).toEqual([...SECONDARY_BODY_TYPES].sort());
    });
});
