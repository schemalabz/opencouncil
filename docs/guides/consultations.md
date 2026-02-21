# Public Consultations

## Concept

A regulation viewer and public feedback platform that enables municipalities to publish consultations on regulatory texts. Citizens can read structured regulation documents, explore geographic areas on an interactive map, leave comments on specific articles or locations, and upvote other comments. The system is driven by a JSON regulation file that defines chapters, articles, and geosets with geographic geometries.

## Architectural Overview

The consultation feature operates as a JSON-driven, dual-view interface:

1. **Regulation JSON**: Each consultation points to a remote JSON file (`jsonUrl`) that defines the entire regulation structure — chapters, articles, geographic areas, cross-references, and definitions. The schema is defined in [`json-schemas/regulation.schema.json`](../../json-schemas/regulation.schema.json).
2. **Database Layer**: Prisma stores consultation metadata (name, end date, active status), comments, and upvotes. Comments are entity-scoped — tied to a specific chapter, article, geoset, or geometry by `entityType` + `entityId`.
3. **Frontend Layer**: A `ConsultationViewer` client component orchestrates two views — a Document View (chapters/articles with markdown content) and a Map View (Mapbox-powered geographic visualization). A floating action button toggles between them. The map view features a community picker with address search, allowing citizens to find nearby collection points by searching their address. A welcome dialog shows the regulation summary on first load.
4. **Comment System**: Authenticated users can leave HTML-rich comments on any entity. Comments support upvoting and trigger email notifications to the municipality's contact address.
5. **Admin Geo-Editor**: Administrators can draw missing geometries directly on the map when regulation text defines areas textually but lacks GeoJSON coordinates. Edits are stored in localStorage and exported as a complete updated regulation JSON.

The consultation feature is gated per-city via the `consultationsEnabled` flag on the City model.

## Regulation JSON Structure

The regulation JSON file is the core data source for each consultation. It follows a schema defined in [`json-schemas/regulation.schema.json`](../../json-schemas/regulation.schema.json).

**Root properties:**
- `title`, `summary` — regulation metadata (summary supports markdown with `{REF:id}` and `{DEF:id}` references)
- `contactEmail`, `ccEmails` — where citizen feedback emails are sent
- `sources` — array of source documents (`{title, url, description?}`)
- `definitions` — dictionary of terms that can be referenced via `{DEF:id}` in markdown
- `defaultView` — initial view mode (`"map"` or `"document"`, defaults to `"document"`)
- `defaultVisibleGeosets` — which geosets are visible on the map by default
- `regulation` — array of `Chapter` and `GeoSet` items (the main content)

**Chapter** (`type: "chapter"`):
- `num`, `id`, `title`, `summary`, `preludeBody` (intro markdown before articles)
- `articles[]` — each with `num`, `id`, `title`, `summary`, `body` (markdown)

**GeoSet** (`type: "geoset"`):
- `id`, `name`, `description`, `color` (hex)
- `geometries[]` — individual geographic shapes

**Geometry** types:
- `point` — single location with GeoJSON Point
- `circle` — point with radius
- `polygon` — area boundary with GeoJSON Polygon
- `derived` — computed from other geosets via `buffer` (zone around source) or `difference` (subtract geosets from base) operations

**Cross-Reference System:**
Markdown content can include `{REF:id}` to link to any chapter, article, geoset, or geometry. When clicked, the viewer navigates to the referenced entity (switching views if needed). `{DEF:id}` links to term definitions shown inline.

## Sequence Diagram

```mermaid
sequenceDiagram
    participant Citizen as Citizen
    participant Frontend as React Frontend
    participant API as Next.js API
    participant DB as PostgreSQL
    participant JSON as Regulation JSON (remote)
    participant Email as Resend Email

    Note over Citizen, Email: Viewing a Consultation
    Citizen->>Frontend: Opens /[cityId]/consultation/[id]
    Frontend->>DB: getConsultationById(cityId, id)
    DB-->>Frontend: Consultation metadata + comments
    Frontend->>JSON: Fetch regulation JSON from jsonUrl
    JSON-->>Frontend: Full regulation data
    Frontend->>Frontend: Render ConsultationViewer (document + map)

    Note over Citizen, Email: Navigating Between Views
    Citizen->>Frontend: Clicks floating toggle button
    Frontend->>Frontend: Switch between Document View and Map View
    Citizen->>Frontend: Clicks {REF:id} link in article text
    Frontend->>Frontend: Navigate to referenced entity (auto-switch view if needed)

    Note over Citizen, Email: Commenting
    Citizen->>Frontend: Writes comment on an article
    Frontend->>API: POST /api/consultations/[id]/comments
    API->>DB: Verify consultation is active
    API->>JSON: Fetch regulation JSON, validate entity exists
    API->>DB: Create ConsultationComment record
    API->>Email: Send notification to municipality contactEmail
    Email-->>API: Email sent
    API-->>Frontend: Comment created
    Frontend->>Frontend: Update comment list

    Note over Citizen, Email: Upvoting
    Citizen->>Frontend: Clicks upvote on a comment
    Frontend->>API: POST /api/consultations/comments/[commentId]/upvote
    API->>DB: Toggle ConsultationCommentUpvote (upsert/delete)
    API-->>Frontend: Updated upvote count
```

## Key Component Pointers

* **Data Models**:
    * `Consultation`: [`prisma/schema.prisma`](../../prisma/schema.prisma) (id, name, jsonUrl, endDate, isActive, cityId)
    * `ConsultationComment`: [`prisma/schema.prisma`](../../prisma/schema.prisma) (entity-scoped via entityType + entityId)
    * `ConsultationCommentUpvote`: [`prisma/schema.prisma`](../../prisma/schema.prisma) (unique constraint on userId + commentId)
    * `City.consultationsEnabled`: Feature flag gating the consultations tab

* **JSON Schema**:
    * Regulation schema: [`json-schemas/regulation.schema.json`](../../json-schemas/regulation.schema.json) (JSON Schema Draft 7 defining chapters, articles, geosets, geometries, references, definitions)

* **Database Functions**:
    * `getConsultationsForCity()`: [`src/lib/db/consultations.ts`](../../src/lib/db/consultations.ts) (active consultations only, ordered by end date)
    * `getAllConsultationsForCity()`: [`src/lib/db/consultations.ts`](../../src/lib/db/consultations.ts) (all consultations including inactive, used on listing page)
    * `getConsultationById()`: [`src/lib/db/consultations.ts`](../../src/lib/db/consultations.ts) (single consultation with computed active status)
    * `addConsultationComment()`: [`src/lib/db/consultations.ts`](../../src/lib/db/consultations.ts) (validates entity exists in regulation JSON, sends email)
    * `toggleCommentUpvote()`: [`src/lib/db/consultations.ts`](../../src/lib/db/consultations.ts) (toggle on/off, returns new count)
    * `deleteConsultationComment()`: [`src/lib/db/consultations.ts`](../../src/lib/db/consultations.ts) (owner-only, cascades to upvotes)
    * `isConsultationActive()`: [`src/lib/db/consultations.ts`](../../src/lib/db/consultations.ts) (checks isActive flag AND end date with timezone awareness)

* **API Endpoints**:
    * `GET/POST /api/consultations/[id]/comments`: [`src/app/api/consultations/[id]/comments/route.ts`](../../src/app/api/consultations/%5Bid%5D/comments/route.ts) (list and create comments)
    * `POST /api/consultations/comments/[commentId]/upvote`: [`src/app/api/consultations/comments/[commentId]/upvote/route.ts`](../../src/app/api/consultations/comments/%5BcommentId%5D/upvote/route.ts) (toggle upvote)
    * `DELETE /api/consultations/comments/[commentId]/delete`: [`src/app/api/consultations/comments/[commentId]/delete/route.ts`](../../src/app/api/consultations/comments/%5BcommentId%5D/delete/route.ts) (owner-only deletion)

* **Pages**:
    * Consultations listing: [`src/app/[locale]/(city)/[cityId]/(other)/(tabs)/consultations/page.tsx`](../../src/app/%5Blocale%5D/(city)/%5BcityId%5D/(other)/(tabs)/consultations/page.tsx) (all consultations for a city)
    * Consultation detail: [`src/app/[locale]/(city)/[cityId]/consultation/[id]/page.tsx`](../../src/app/%5Blocale%5D/(city)/%5BcityId%5D/consultation/%5Bid%5D/page.tsx) (viewer with document + map)
    * Comments print view: [`src/app/[locale]/(city)/[cityId]/consultation/[id]/comments/page.tsx`](../../src/app/%5Blocale%5D/(city)/%5BcityId%5D/consultation/%5Bid%5D/comments/page.tsx) (print-friendly comment summary)
    * Layout: [`src/app/[locale]/(city)/[cityId]/consultation/[id]/layout.tsx`](../../src/app/%5Blocale%5D/(city)/%5BcityId%5D/consultation/%5Bid%5D/layout.tsx) (header, footer, feature-flag check)

* **Frontend Components** (all under `src/components/consultations/`):
    * `ConsultationViewer`: Master orchestrator — manages view state (document/map), URL hash navigation, chapter expansion, reference click handling, welcome dialog with regulation summary, and `defaultView` support
    * `ConsultationHeader`: Title, status badge (Active/Inactive), end date, comment count
    * `ConsultationDocument`: Renders chapters/articles with expand/collapse, AI summary cards, sources list
    * `ChapterView` / `ArticleView`: Individual chapter and article renderers with comment counts, permalinks, collapsible content
    * `MarkdownContent`: Renders markdown with `{REF:id}` and `{DEF:id}` pattern handling as interactive links
    * `ConsultationMap`: Mapbox map with geoset rendering, layer controls, detail panel, derived geometry computation (buffer/difference), address search with search location pins, initial fit-to-bounds, and `GeometryCollection` zoom support
    * `LayerControlsPanel` / `LayerControlsButton`: Dual-mode sidebar — in normal mode shows a simplified community picker with address search (via `LocationSelector`); in editing mode shows the full layer controls with checkbox tree UI for toggling geoset/geometry visibility
    * `DetailPanel`: Side sheet showing selected geoset/geometry/search-location info. For search locations, shows nearby points within 500m sorted by distance (Haversine). For geosets, lists point geometries with comment counts. For geometries, shows description, textual definition, and comments
    * `GeoSetItem` / `GeometryItem`: Tree items in layer controls (editing mode) with checkboxes, color swatches, clickable names, and inline comment counts
    * `CommentSection`: Rich text editor (ReactQuill), authentication check, comment display with upvotes and delete
    * `CommentsOverviewSheet`: Modal listing all comments with sort options (recent/likes), entity type badges, navigation
    * `AISummaryCard`: Collapsible card for AI-generated summaries on chapters/articles
    * `SourcesList`: Regulation source documents and contact information
    * `PermalinkButton`: Copy-to-clipboard link for any entity
    * `DocumentNavigation`: Sticky sidebar with chapter/article outline
    * `ViewToggleButton`: Floating button to switch between document and map views
    * `EditingToolsPanel`: Admin drawing tools for map geometry editing
    * `PrintButton`: Triggers native print dialog on comments page

* **City-Level Component**:
    * `CityConsultations`: [`src/components/cities/CityConsultations.tsx`](../../src/components/cities/CityConsultations.tsx) (card grid listing for city consultations tab)

* **Types**:
    * `RegulationData`, `Geometry`, `CurrentUser`, `GeoSetData`, `SEARCH_COLORS`, etc.: [`src/components/consultations/types.ts`](../../src/components/consultations/types.ts) (shared types used across all consultation components)

* **Email**:
    * Template: [`src/lib/email/templates/consultation-comment.tsx`](../../src/lib/email/templates/consultation-comment.tsx) (React Email HTML template with entity permalink)
    * Sender: [`src/lib/email/consultation.ts`](../../src/lib/email/consultation.ts) (sends via Resend to contactEmail + ccEmails)

## Scripts & Tooling

Regulation JSON files are produced through a pipeline of scripts. Each consultation may use a different subset depending on the source material.

### PDF-to-JSON Conversion

[`scripts/convert-regulation-pdf.ts`](../../scripts/convert-regulation-pdf.ts)

Converts a regulation PDF into a structured regulation JSON file using Claude AI. The script extracts text from the PDF, sends it to the Anthropic API with the regulation JSON schema as guidance, and validates the output against `json-schemas/regulation.schema.json`. Best suited for text-heavy regulations with chapters and articles.

**Used by**: Scooter regulation — the source PDF contained the full legal text, chapter structure, and coordinate data embedded in textual definitions.

### Coordinate Transformation

[`scripts/transform-regulation-coordinates.ts`](../../scripts/transform-regulation-coordinates.ts)

Transforms coordinates embedded in regulation JSON from GGRS87 (Greek Grid) projection to WGS84 (standard GeoJSON). Parses `textualDefinition` and `description` fields for coordinate patterns like `X: 123456, Y: 789012`, converts them using proj4, and writes GeoJSON Point geometries back into the file.

**Used by**: Scooter regulation — the source PDF contained GGRS87 coordinates that needed transformation to WGS84 for Mapbox rendering.

### Address Geocoding

[`scripts/geocode-regulation-addresses.ts`](../../scripts/geocode-regulation-addresses.ts)

Geocodes point geometries that have a `textualDefinition` (street address) but no `geojson` coordinates. Uses the Google Geocoding API scoped to Athens with bounds biasing. Validates that results fall within Athens municipality bounds. Produces a failures report for addresses that need manual coordinate entry via the admin geo-editor.

**Options**: `--dry-run` (preview without API calls), `--force` (re-geocode existing), `--delay=N` (rate limiting in ms).

**Used by**: Cooking oil regulation — the source PDF contained 210 street addresses/intersections that needed geocoding to map coordinates.

### Consultation-Specific Generators

Some consultations require a custom generator script when the source material isn't a structured PDF suitable for AI extraction (e.g., tabular address lists, data scraped from documents).

[`scripts/generate-cooking-oil-regulation.ts`](../../scripts/generate-cooking-oil-regulation.ts)

Generates the complete regulation JSON for the Athens cooking oil collection bin consultation. Contains all 210 addresses across 7 Municipal Communities (Δημοτικές Κοινότητες) extracted manually from the source PDF. Each community becomes a geoset with a distinct color, and each address becomes a point geometry.

### Typical Pipeline

| Step | Scooter Regulation | Cooking Oil Regulation |
|------|-------------------|----------------------|
| 1. Extract structure | `convert-regulation-pdf.ts` (AI) | `generate-cooking-oil-regulation.ts` (manual) |
| 2. Resolve coordinates | `transform-regulation-coordinates.ts` (GGRS87→WGS84) | `geocode-regulation-addresses.ts` (address→lat/lng) |
| 3. Fix failures | Admin geo-editor | Admin geo-editor (4 addresses) |
| 4. Upload JSON to S3 | Admin dashboard upload | Admin dashboard upload |
| 5. Create DB record | Prisma seed | Admin consultations page |

## Hosting Regulation JSON Files

Regulation JSON files must be hosted at a publicly accessible URL. The URL is stored in `Consultation.jsonUrl` and fetched by the frontend at page load and by the API during comment validation.

### Uploading via Admin Dashboard

The admin consultations page (`/admin/consultations`) supports uploading and managing regulation JSON files:

1. **New consultation**: In the "Create Consultation" form, either paste a URL directly into the "Regulation JSON URL" field, or click the upload button (↑) to upload a `.json` file to S3. The upload returns a public URL that auto-fills the field.

2. **Update existing consultation**: In the consultations table, hover over the JSON URL column and click the pencil icon to enter edit mode. You can either paste a new URL or click the upload button to replace the file on S3.

### Storage on DigitalOcean Spaces (S3)

Files are uploaded via the `/api/upload` endpoint which:
- Requires authentication (admin or authorized editor)
- Generates a random UUID filename (preserving the `.json` extension)
- Stores files under the `uploads/` prefix in the configured DO Spaces bucket
- Sets `public-read` ACL so the URL is publicly accessible
- Returns the full public URL (e.g., `https://{bucket}.{region}.digitaloceanspaces.com/uploads/{uuid}.json`)

### Workflow for a New Consultation

1. Generate the regulation JSON using the appropriate script (see [Scripts & Tooling](#scripts--tooling))
2. Validate it against `json-schemas/regulation.schema.json`
3. Go to `/admin/consultations` and create a new consultation:
   - Upload the JSON file (or paste an already-hosted URL)
   - Select the city, set name and end date
4. After creation, use the admin geo-editor on the consultation map to draw any missing geometries
5. Export the updated JSON from the geo-editor and re-upload it via the admin table's edit button

### Local Development

For local development, you can place regulation JSON files in the `public/` directory and use relative URLs (e.g., `/regulation-cooking-oil.json`). However, for production and shared environments, always use S3-hosted URLs so the files are accessible regardless of the deployment.

## Business Rules & Assumptions

### Feature Gating
1. Consultations are only visible for cities where `consultationsEnabled` is `true`
2. The consultation listing page and detail page both check this flag

### Active Status
1. A consultation is active when **both** `isActive` is `true` in the database **and** `endDate` has not passed
2. End date comparison is timezone-aware using the city's timezone (via `date-fns-tz`)
3. Inactive consultations are visible on the listing page but comments are disabled

### Comments
1. Only authenticated users can create comments
2. Comments are entity-scoped: each comment targets a specific `entityType` (CHAPTER, ARTICLE, GEOSET, GEOMETRY) and `entityId`
3. Before saving, the API fetches the regulation JSON and validates the target entity actually exists
4. Comment body is validated: non-empty, max 5000 characters
5. HTML in comments is sanitized to allow only safe tags (`p`, `strong`, `em`, `a`, `ul`, `ol`, `li`)
6. Comments can only be deleted by their author
7. Upvotes use a unique constraint (`userId`, `commentId`) for toggle behavior
8. Each new comment triggers an email notification to the municipality (`contactEmail` from the regulation JSON, CC'd to `ccEmails`)

### Regulation JSON
1. The regulation JSON is fetched from a remote URL stored in `Consultation.jsonUrl`
2. It is fetched at page load on the detail page and cached for entity validation in comment creation
3. The schema supports both static geometries (with GeoJSON coordinates) and derived geometries (computed via buffer/difference operations)
4. Geometries may have a `textualDefinition` but null `geojson` — the admin geo-editor addresses this gap

### Map & Geo-Editor
1. The map uses Mapbox GL with custom styling for different geosets (each has a `color`) and always-on street labels
2. `defaultVisibleGeosets` in the regulation JSON controls initial map layer visibility
3. The map auto-fits to all visible features on initial load (unless a hash navigation targets a specific entity)
4. Citizens can search addresses via the community picker; searched locations appear as colored pins and open a detail panel showing nearby points within 500m
5. Clicking a community boundary polygon opens the parent geoset detail; clicking a point opens the geometry detail
6. Point labels (addresses) appear at higher zoom levels; polygon labels (community names) fade out at street level to avoid noise
7. Derived geometries are computed client-side using buffer/difference operations
8. The admin geo-editor stores drawn geometries in browser `localStorage` until exported
9. Export produces a complete updated `regulation.json` merging local edits with original data
10. Only super-administrators can access editing mode (via a small edit icon in the community picker header)

### Mobile Experience
1. On mobile (<768px), overlay panels render as bottom sheet drawers (via vaul) instead of side sheets / dialogs — providing a native iOS-style feel
2. The welcome dialog uses Credenza (Dialog on desktop, Drawer on mobile) for automatic switching
3. DetailPanel, CommentsOverviewSheet, and LayerControlsPanel use an inline `if (isMobile)` pattern: `Sheet` on desktop, `Drawer` on mobile
4. Non-modal drawers (`DetailPanel`, `LayerControlsPanel`) keep the map interactive behind the sheet; modal drawers (`CommentsOverviewSheet`) block interaction
5. Only one bottom sheet is open at a time — opening a detail panel auto-closes the layer controls
6. Map zoom padding shifts content upward on mobile when a drawer is open so geometries aren't hidden behind the bottom sheet
7. The `ViewToggleButton` FAB repositions above any open drawer to avoid overlap

### Navigation
1. URL hash anchors (`#chapter-1`, `#article-3`, `#geoset-prohibited_areas`) enable deep linking to specific entities
2. `{REF:id}` links in markdown content navigate to the referenced entity, switching between document and map views as needed
3. The comments print page orders comments by document structure (chapters/articles first, then geosets/geometries)

### Multi-Tenancy
1. All consultation data is city-scoped — queries always filter by `cityId`
2. Comments store both `consultationId` and `cityId` for multi-tenant isolation
3. Database indexes optimize queries on `(cityId, isActive)` and `(consultationId, entityType, entityId)`
