/**
 * Run `fn` over `items` with at most `limit` calls in flight, and wait for
 * every call to settle, like Promise.allSettled. A caller that cleans up
 * after a failure then sees every result, also of the calls that were still
 * running when the first one failed. The results keep the order of `items`.
 */
export async function mapSettled<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`mapSettled needs a limit of 1 or more, not ${limit}`);
    const results: PromiseSettledResult<R>[] = new Array(items.length);
    let next = 0;
    const worker = async () => {
        for (let index = next++; index < items.length; index = next++) {
            try {
                results[index] = { status: 'fulfilled', value: await fn(items[index], index) };
            } catch (reason) {
                results[index] = { status: 'rejected', reason };
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}
