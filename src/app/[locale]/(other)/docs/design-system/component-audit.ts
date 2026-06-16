export const AUDIT_CATEGORIES = ['common', 'sibling-only', 'main-only', 'divergent'] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export interface AuditRow {
    name: string;
    inMain: boolean;
    inSibling: boolean;
    category: AuditCategory;
    note?: string;
}

// Compared: main `src/components/ui` ↔ sibling `../opencouncil-design/src/components/{ui,patterns}`.
export const COMPONENT_AUDIT: AuditRow[] = [
    // Common ui primitives (in both)
    { name: 'button', inMain: true, inSibling: true, category: 'common' },
    { name: 'badge', inMain: true, inSibling: true, category: 'divergent', note: 'Main adds badge-picker / badge-with-explanation; sibling is plain.' },
    { name: 'input', inMain: true, inSibling: true, category: 'common' },
    { name: 'textarea', inMain: true, inSibling: true, category: 'common' },
    { name: 'label', inMain: true, inSibling: true, category: 'common' },
    { name: 'select', inMain: true, inSibling: true, category: 'common' },
    { name: 'checkbox', inMain: true, inSibling: true, category: 'common' },
    { name: 'switch', inMain: true, inSibling: true, category: 'common' },
    { name: 'card', inMain: true, inSibling: true, category: 'divergent', note: 'Verify gradient-ignite border vs plain card during adoption.' },
    { name: 'dialog', inMain: true, inSibling: true, category: 'common' },
    { name: 'popover', inMain: true, inSibling: true, category: 'common' },
    { name: 'tooltip', inMain: true, inSibling: true, category: 'common' },
    { name: 'alert', inMain: true, inSibling: true, category: 'common' },
    { name: 'separator', inMain: true, inSibling: true, category: 'common' },
    { name: 'skeleton', inMain: true, inSibling: true, category: 'common' },
    { name: 'dropdown-menu', inMain: true, inSibling: true, category: 'common' },
    // Sibling-only primitives (worth adopting)
    { name: 'heading', inMain: false, inSibling: true, category: 'sibling-only', note: 'Typographic primitive the main repo lacks.' },
    { name: 'text', inMain: false, inSibling: true, category: 'sibling-only', note: 'Typographic primitive the main repo lacks.' },
    // Sibling-only patterns
    { name: 'form-field', inMain: false, inSibling: true, category: 'sibling-only', note: 'Pattern (label+control+error).' },
    { name: 'empty-state', inMain: false, inSibling: true, category: 'sibling-only', note: 'Pattern.' },
    { name: 'callout', inMain: false, inSibling: true, category: 'sibling-only', note: 'Pattern.' },
    { name: 'page-container', inMain: false, inSibling: true, category: 'sibling-only', note: 'Pattern.' },
    { name: 'page-header', inMain: false, inSibling: true, category: 'sibling-only', note: 'Pattern.' },
    { name: 'app-header', inMain: false, inSibling: true, category: 'sibling-only', note: 'Pattern (main has domain headers under layout/landing, not a DS primitive).' },
    { name: 'app-footer', inMain: false, inSibling: true, category: 'sibling-only', note: 'Pattern.' },
    { name: 'breadcrumbs', inMain: true, inSibling: true, category: 'divergent', note: 'Main `breadcrumb` is a ui primitive; sibling `breadcrumbs` is a pattern — naming/level mismatch.' },
    // Main-only (notable; not exhaustive)
    { name: 'tabs', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'calendar', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'chart', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'command', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'drawer', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'sheet', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'sidebar', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'table', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'pagination', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'progress', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'slider', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'scroll-area', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'hover-card', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'context-menu', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'collapsible', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'toast', inMain: true, inSibling: false, category: 'main-only' },
    { name: 'form', inMain: true, inSibling: false, category: 'main-only' },
];
