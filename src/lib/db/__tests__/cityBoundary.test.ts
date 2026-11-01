/** @jest-environment node */
import { updateCityGeometryDirect } from '../citiesAdmin';
import { NotFoundError } from '@/lib/api/errors';

const mockExecuteRaw = jest.fn();
jest.mock('../prisma', () => ({ __esModule: true, default: { $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args) } }));

const geometry: GeoJSON.Polygon = { type: 'Polygon', coordinates: [[[18.3, 43.8], [18.4, 43.8], [18.4, 43.9], [18.3, 43.8]]] };

it('stores a normalized boundary with parameterized coordinates and city id', async () => {
    mockExecuteRaw.mockResolvedValueOnce(1);
    await updateCityGeometryDirect('sarajevo', geometry);
    const [sql, json, cityId] = mockExecuteRaw.mock.calls.at(-1)!;
    expect(sql.join('?')).toContain('ST_SetSRID(ST_GeomFromGeoJSON(?), 4326)');
    expect(json).toBe(JSON.stringify(geometry));
    expect(cityId).toBe('sarajevo');
});

it('does not report success when the city was removed before the write', async () => {
    mockExecuteRaw.mockResolvedValueOnce(0);
    await expect(updateCityGeometryDirect('missing', geometry)).rejects.toThrow(NotFoundError);
});
