/**
 * Round-robin over groups of items: the first item of each group, then the
 * second of each, and so on. Groups come in the order of their first item, and
 * items keep their input order within a group.
 */
export function interleaveBy<T>(items: T[], groupOf: (item: T) => string): T[] {
    const groups = new Map<string, T[]>();
    for (const item of items) {
        const key = groupOf(item);
        const group = groups.get(key);
        if (group) group.push(item);
        else groups.set(key, [item]);
    }
    const queues = [...groups.values()];
    const out: T[] = [];
    for (let round = 0; out.length < items.length; round++) {
        for (const queue of queues) {
            if (round < queue.length) out.push(queue[round]);
        }
    }
    return out;
}
