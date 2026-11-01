/** @jest-environment node */
import { Prisma } from '@prisma/client';
import { publishCityDemoDirect } from '../citiesAdmin';

const mockUpdate = jest.fn();
jest.mock('../prisma', () => ({ __esModule: true, default: { city: { update: (...args: unknown[]) => mockUpdate(...args) } } }));

it.each(['pending', 'demo', 'supported'])('publishes only eligible city status: %s', async status => {
    // Model the database predicate, including an existing demo retry and a
    // concurrently upgraded customer. No unconditional read-then-write.
    mockUpdate.mockImplementation(async ({ where, data }: {
        where: { id: string; status: { in: string[] } };
        data: { status: string };
    }) => {
        if (!where.status?.in.includes(status)) {
            throw new Prisma.PrismaClientKnownRequestError('No matching record', { code: 'P2025', clientVersion: 'test' });
        }
        return { id: where.id, status: data.status };
    });
    if (status === 'supported') {
        await expect(publishCityDemoDirect('mannheim')).rejects.toMatchObject({ code: 'P2025' });
    } else {
        await expect(publishCityDemoDirect('mannheim')).resolves.toMatchObject({ id: 'mannheim', status: 'demo' });
    }
});
