import sharp from 'sharp';
import { getPortraitData } from '../portrait';

const fetchMock = jest.fn();
const originalFetch = global.fetch;
beforeEach(() => { fetchMock.mockReset(); global.fetch = fetchMock; });
afterAll(() => { global.fetch = originalFetch; });

it.each([
    'http://data.opencouncil.gr/person.png', 'https://127.0.0.1/private', 'https://[::1]/private',
    'https://169.254.169.254/latest/meta-data', 'https://internal.test/photo',
    'https://data.opencouncil.gr.evil.test/photo', 'https://data.opencouncil.gr@localhost/photo',
    'https://data.opencouncil.gr:8443/photo', 'data:image/png;base64,abc',
])('rejects an untrusted portrait before making a request: %s', async url => {
    expect(await getPortraitData(url)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
});

it('fetches only a trusted origin without redirects and embeds a bounded PNG', async () => {
    const png = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#eee' } }).png().toBuffer();
    fetchMock.mockResolvedValue(new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } }));
    const result = await getPortraitData('https://data.opencouncil.gr/person.png');
    expect(fetchMock).toHaveBeenCalledWith('https://data.opencouncil.gr/person.png', { redirect: 'error', signal: expect.any(AbortSignal) });
    expect(result).toMatch(/^data:image\/png;base64,/);
    expect(await sharp(Buffer.from(result!.split(',')[1], 'base64')).metadata()).toMatchObject({ width: 256, height: 256 });
});

it('falls back for redirects, timeouts, invalid files and unsupported types', async () => {
    for (const response of [new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private' } }), new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }), new Response('not a PNG', { headers: { 'content-type': 'image/png' } })]) {
        fetchMock.mockResolvedValueOnce(response);
        expect(await getPortraitData('https://data.opencouncil.gr/person.png')).toBeNull();
    }
    fetchMock.mockRejectedValueOnce(new DOMException('Timed out', 'TimeoutError'));
    expect(await getPortraitData('https://data.opencouncil.gr/person.png')).toBeNull();
});

it('cancels an oversized stream even without a content-length header', async () => {
    const cancel = jest.fn();
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(2_000_001)); }, cancel });
    fetchMock.mockResolvedValue(new Response(body, { headers: { 'content-type': 'image/png' } }));
    expect(await getPortraitData('https://data.opencouncil.gr/person.png')).toBeNull();
    expect(cancel).toHaveBeenCalled();
});

it('rejects compressed images with excessive decoded dimensions', async () => {
    const png = await sharp({ create: { width: 2500, height: 2500, channels: 3, background: '#eee' } }).png().toBuffer();
    fetchMock.mockResolvedValue(new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } }));
    expect(await getPortraitData('https://data.opencouncil.gr/person.png')).toBeNull();
});
