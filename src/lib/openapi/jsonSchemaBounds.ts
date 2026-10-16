/**
 * zod gives every `.int()` the safe-integer range. In a JSON Schema the
 * ±2^53-1 bounds tell a reader nothing, so the OpenAPI spec and the City
 * Creator prompt both drop them.
 */
export function stripSafeIntBounds(node: { minimum?: unknown; maximum?: unknown }): void {
    if (node.maximum === Number.MAX_SAFE_INTEGER) delete node.maximum;
    if (node.minimum === Number.MIN_SAFE_INTEGER) delete node.minimum;
}
