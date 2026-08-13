import { COMPONENT_AUDIT, type AuditCategory } from './component-audit';

const LABELS: Record<AuditCategory, string> = {
    common: 'Common (both)',
    'sibling-only': 'Sibling-only (adopt?)',
    'main-only': 'Main-only',
    divergent: 'Divergent',
};

const ORDER: AuditCategory[] = ['common', 'divergent', 'sibling-only', 'main-only'];

export function AuditTable() {
    return (
        <div className="space-y-8">
            {ORDER.map((category) => {
                const rows = COMPONENT_AUDIT.filter((r) => r.category === category);
                if (rows.length === 0) return null;
                return (
                    <div key={category}>
                        <h3 className="text-sm font-semibold mb-2">{LABELS[category]}</h3>
                        <div className="rounded-md border divide-y">
                            {rows.map((row) => (
                                <div key={row.name} className="flex items-baseline gap-3 px-3 py-2 text-sm">
                                    <code className="font-mono text-xs shrink-0 w-40">{row.name}</code>
                                    <span className="text-muted-foreground">{row.note ?? ''}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
