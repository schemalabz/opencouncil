// _registry/types.ts
import type { ReactNode } from 'react';

export type DocKind = 'components' | 'patterns';

export interface DocEntry {
    /** url slug, e.g. "button" */
    slug: string;
    /** display name, e.g. "Button" */
    name: string;
    /** one-line description */
    description: string;
    /** source file path in the repo */
    sourcePath: string;
    /** rendered preview (uncontrolled; no hooks) */
    sample: ReactNode;
    /** optional smaller preview for index cards; falls back to `sample` */
    previewSample?: ReactNode;
    /** JSX source string for the sample, shown in the "Code" block on the detail page */
    code?: string;
    /** import statement(s) for the component(s) used in `code` */
    imports?: string;
    /** the design tokens / styles this element uses (for the "Design" prompt) */
    design?: string;
    dos: string[];
    donts: string[];
}
