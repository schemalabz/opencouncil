import "server-only";
import type { Prisma } from "@prisma/client";
import prisma from "./prisma";

/**
 * The entities a superadmin can grant an account: cities, parties, persons and
 * administrative bodies, each with a label for the picker of the user tool.
 * The caller authorizes: GET /api/admin/entities admits superadmins only.
 */

const cityEntitySelect = {
    id: true,
    name: true,
} satisfies Prisma.CitySelect;

const cityRefSelect = { select: cityEntitySelect } satisfies Prisma.CityDefaultArgs;

const partyEntitySelect = { id: true, name: true, city: cityRefSelect } satisfies Prisma.PartySelect;
const personEntitySelect = { id: true, name: true, city: cityRefSelect } satisfies Prisma.PersonSelect;
const bodyEntitySelect = { id: true, name: true, city: cityRefSelect } satisfies Prisma.AdministrativeBodySelect;

type CityEntityRow = Prisma.CityGetPayload<{ select: typeof cityEntitySelect }>;
type CityScopedEntityRow = Prisma.PartyGetPayload<{ select: typeof partyEntitySelect }>;

export type AdminEntity =
    | (CityEntityRow & { type: 'city'; displayName: string })
    | (CityScopedEntityRow & { type: 'party' | 'person' | 'body'; displayName: string });

export async function getAdminEntities(): Promise<AdminEntity[]> {
    const byName = { name: 'asc' } as const;
    const [cities, parties, people, bodies] = await Promise.all([
        prisma.city.findMany({ select: cityEntitySelect, orderBy: byName }),
        prisma.party.findMany({ select: partyEntitySelect, orderBy: byName }),
        prisma.person.findMany({ select: personEntitySelect, orderBy: byName }),
        prisma.administrativeBody.findMany({ select: bodyEntitySelect, orderBy: byName }),
    ]);

    const inCity = (type: 'party' | 'person' | 'body') => (row: CityScopedEntityRow): AdminEntity => ({
        ...row,
        type,
        displayName: `${row.city.name} / ${row.name}`,
    });

    return [
        ...cities.map((city): AdminEntity => ({ ...city, type: 'city', displayName: city.name })),
        ...parties.map(inCity('party')),
        ...people.map(inCity('person')),
        ...bodies.map(inCity('body')),
    ];
}
