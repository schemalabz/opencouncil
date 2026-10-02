import { Badge } from "@/components/ui/badge";

/**
 * The count on a bulk-action button: how many people it will act on. One
 * component, so every such button reads the same.
 */
export function ActionCount({ count }: { count: number }) {
    return <Badge variant="secondary" className="px-1.5 font-normal tabular-nums">{count}</Badge>;
}
