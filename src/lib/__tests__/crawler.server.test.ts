jest.mock('next/headers', () => ({ headers: jest.fn() }));

import { headers } from 'next/headers';
import { isCrawlerRequest } from '../crawler.server';

const withUserAgent = (value: string) =>
    (headers as jest.Mock).mockResolvedValue(new Headers({ 'user-agent': value }));

describe('isCrawlerRequest', () => {
    it.each([
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
        'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.0)',
    ])('recognises a crawler: %s', async (ua) => {
        withUserAgent(ua);
        expect(await isCrawlerRequest()).toBe(true);
    });

    it('lets a browser through', async () => {
        withUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36');
        expect(await isCrawlerRequest()).toBe(false);
    });
});
