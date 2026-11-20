/** @jest-environment node */
import * as route from '@/app/api/[...rest]/route';

it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const)('answers %s with a JSON 404', async (method) => {
    const res = route[method]();

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
});
