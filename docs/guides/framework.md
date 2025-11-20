**Concept**

A one-sentence description of the feature's purpose.

**Architectural Overview**

A narrative explaining how the system components (frontend, backend, database, task server) collaborate to deliver the feature.

**Sequence Diagram**

A Mermaid.js diagram illustrating the end-to-end flow, from user action to final output. This is a critical, code-free way to visualize the process.

**Key Component Pointers**

A curated list of references to the most important parts of the codebase. This is a "map" to the code, not a copy of it.

**Format**: Use concise bullet points with the component/function name followed by a clickable relative link to the full file path (e.g., `Component`: [`src/components/Component.tsx`](../../src/components/Component.tsx)) and brief descriptions in parentheses. Group by category (Data Models, API Endpoints, Frontend Components, etc.).

**Business Rules & Assumptions**

A list of important constraints or logic that isn't explicit in the code structure (e.g., "Highlights can only be created for meetings with a complete transcript").

### General Guidelines

When creating framework documents, always:
1. **Reference existing docs** instead of duplicating detailed implementation information
2. **Link to related features** that interact with the current feature
3. **Point to architectural docs** for system-level understanding
4. **Include "See also" sections** for complementary documentation
5. **Use relative paths** for internal documentation links (e.g., `../other-doc.md`) 