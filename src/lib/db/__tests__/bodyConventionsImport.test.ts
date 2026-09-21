import fs from 'fs';
import { decisionConventionsSchema } from '@/lib/decisionConventions';
import { importBodyConventions, type BodyConventionsRecord } from '../bodyConventionsImport';

const { bodies } = JSON.parse(fs.readFileSync('fixtures/body-conventions.json', 'utf-8')) as { bodies: BodyConventionsRecord[] };

describe('fixtures/body-conventions.json', () => {
    it('holds one record per body, each in the stored shape', () => {
        expect(new Set(bodies.map(b => `${b.cityId}/${b.body}`)).size).toBe(bodies.length);
        for (const b of bodies) expect({ body: `${b.cityId}/${b.body}`, ok: decisionConventionsSchema.safeParse(b.conventions).success }).toEqual({ body: `${b.cityId}/${b.body}`, ok: true });
    });
    it('confirms nothing on a person\'s behalf', () => {
        expect(bodies.filter(b => b.conventions.provenance.source !== 'profile')).toEqual([]);
    });
});

describe('importBodyConventions', () => {
    const record = bodies[0];
    const client = (stored: unknown) => {
        const update = jest.fn();
        return { update, administrativeBody: { findFirst: jest.fn().mockResolvedValue(stored), update } };
    };
    it('writes a body that was only profiled', async () => {
        const c = client({ id: 'b1', decisionConventions: { provenance: { source: 'profile' } } });
        expect(await importBodyConventions([record], c as never)).toMatchObject({ written: [`${record.cityId}/${record.body}`] });
        expect(c.update).toHaveBeenCalledTimes(1);
    });
    it('leaves alone a body a person has confirmed', async () => {
        const confirmed = { ...record.conventions, provenance: { source: 'manual', confirmedBy: 'user-1' } };
        const c = client({ id: 'b1', decisionConventions: confirmed });
        expect(await importBodyConventions([record], c as never)).toMatchObject({ written: [], confirmedSkipped: [`${record.cityId}/${record.body}`] });
        expect(c.update).not.toHaveBeenCalled();
    });
    /** The callback's own guard reads a parsed record; a bare `manual` kept here and not there left one row two sources of truth. */
    it('writes over a half-shaped row that only says manual, as the callback does', async () => {
        const c = client({ id: 'b1', decisionConventions: { provenance: { source: 'manual' } } });
        expect(await importBodyConventions([record], c as never)).toMatchObject({ written: [`${record.cityId}/${record.body}`], confirmedSkipped: [] });
        expect(c.update).toHaveBeenCalledTimes(1);
    });
    it('reads one body per record deterministically, since the name is not unique', async () => {
        const c = client({ id: 'b1', decisionConventions: null });
        await importBodyConventions([record], c as never);
        expect(c.administrativeBody.findFirst).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { id: 'asc' } }));
    });
    it('reports a body the database does not hold instead of creating it', async () => {
        const c = client(null);
        expect(await importBodyConventions([record], c as never)).toMatchObject({ missing: [`${record.cityId}/${record.body}`] });
        expect(c.update).not.toHaveBeenCalled();
    });
});
