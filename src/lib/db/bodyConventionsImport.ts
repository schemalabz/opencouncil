import type { Prisma, PrismaClient } from '@prisma/client';
import { decisionConventionsSchema, isConfirmedByPerson, type DecisionConventions } from '../decisionConventions';

export interface BodyConventionsRecord { cityId: string; body: string; conventions: DecisionConventions }

/**
 * Write the records a body starts from (fixtures/body-conventions.json) to a
 * database. A body a person has confirmed is left alone: the file is the
 * starting state, and re-running it must not undo what someone stated in
 * admin. A record naming a body the database does not hold is reported, not
 * created — a seed holds a few cities, production holds them all.
 *
 * Takes the client because the seed runs on its own. Kept out of
 * administrativeBodies.ts on purpose: that module is `"use server"`, where every
 * export is an action a browser can call, and this one checks nobody's rights.
 */
export async function importBodyConventions(
    records: BodyConventionsRecord[],
    client: Pick<PrismaClient, 'administrativeBody'>,
): Promise<{ written: string[]; confirmedSkipped: string[]; missing: string[] }> {
    const result = { written: [] as string[], confirmedSkipped: [] as string[], missing: [] as string[] };
    for (const r of records) {
        const key = `${r.cityId}/${r.body}`;
        // Ordered: the name is not unique in the schema, and a city holding two
        // bodies of one name must still import the same one on every run.
        const stored = await client.administrativeBody.findFirst({ where: { cityId: r.cityId, name: r.body }, orderBy: { id: 'asc' }, select: { id: true, decisionConventions: true } });
        if (!stored) { result.missing.push(key); continue; }
        if (isConfirmedByPerson(stored.decisionConventions)) { result.confirmedSkipped.push(key); continue; }
        await client.administrativeBody.update({ where: { id: stored.id }, data: { decisionConventions: decisionConventionsSchema.parse(r.conventions) as unknown as Prisma.InputJsonValue } });
        result.written.push(key);
    }
    return result;
}
