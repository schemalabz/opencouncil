# Component audit: main ↔ opencouncil-design

Compared `src/components/ui` (main repo) against `../opencouncil-design/src/components/{ui,patterns}` (sibling docs app). Mirrors `src/app/[locale]/(other)/docs/design-system/component-audit.ts` — update both together.

## Common (in both)
button, input, textarea, label, select, checkbox, switch, dialog, popover, tooltip, alert, separator, skeleton, dropdown-menu

## Divergent / naming mismatch
- **badge** — main adds `badge-picker` / `badge-with-explanation`; sibling is plain.
- **card** — verify the gradient-ignite border (sibling/bundle) vs main's plainer card before adopting.
- **breadcrumb(s)** — main `breadcrumb` is a ui primitive; sibling `breadcrumbs` is a pattern (level/naming mismatch).

## Sibling-only — candidates to adopt
- **Primitives:** `heading`, `text` (typographic primitives the main repo lacks).
- **Patterns:** `form-field`, `empty-state`, `callout`, `page-container`, `page-header`, `app-header`, `app-footer`.

## Main-only (not exhaustive)
tabs, calendar, chart, command, drawer, sheet, sidebar, table, pagination, progress, slider, scroll-area, hover-card, context-menu, collapsible, toast/toaster, form — plus composites (stats-card, clickable-card, collapsible-card, multi-select-dropdown, phone-field, date-range-picker, triple-toggle, …).

> The sibling app is not part of this build; this audit is a consolidation guide, not a dependency.
