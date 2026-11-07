/**
 * The work's own result, or 'timeout' when it has not settled within ms.
 * The work itself is not cancelled and may still finish later.
 */
export async function withinDeadline<T>(work: Promise<T>, ms: number): Promise<T | 'timeout'> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), ms);
    });
    return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}
