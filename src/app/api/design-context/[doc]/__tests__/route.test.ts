// src/app/api/design-context/[doc]/__tests__/route.test.ts
import { GET } from '../route';
import { NextRequest } from 'next/server';

function call(doc: string) {
    const req = new NextRequest(`http://localhost/api/design-context/${doc}`);
    return GET(req, { params: Promise.resolve({ doc }) });
}

describe('GET /api/design-context/[doc]', () => {
    it('returns text/plain for a valid doc', async () => {
        const res = await call('design');
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toContain('text/plain');
        expect(await res.text()).toContain('Civic Flame');
    });

    it('serves the combined doc', async () => {
        const res = await call('combined');
        expect(res.status).toBe(200);
        expect(await res.text()).toContain('Designing for OpenCouncil');
    });

    it('404s an unknown doc', async () => {
        const res = await call('bogus');
        expect(res.status).toBe(404);
    });
});
