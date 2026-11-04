# MCP contracts

City reads and updates are the first tools with declared output schemas. Other
tools retain their existing responses while they migrate individually.

## Ownership

- `zod-schemas/city.ts` owns city field rules and compact boundary metadata.
- `openapi/entities.ts` composes REST entity schemas from the shared fields.
- `mcp/citySchemas.ts` composes the compact MCP city profile from those entity
  fields, retaining the existing `municipality` alias. It owns the city-update
  result envelope and infers the corresponding TypeScript types.
- `db/citiesAdmin.ts` owns the shared city-row read, PostGIS operations and the
  transaction that compares and applies an authorized update. The browser's
  `getCity` delegates its row read here and retains its optional simplified
  drawing geometry and error handling.
- `mcp/data.ts` owns the single profile projection, including realm URLs,
  political parties and permission-filtered administrative bodies.
- `mcp/toolSupport.ts` owns serialization and readable errors. The installed
  MCP SDK validates `structuredContent` against the registered `outputSchema`.

Keep FormData coercion, session authentication, token authorization and client
envelopes in their existing adapters. A shared field rule does not require a
shared transport request or a full database row in every response.

## City results

`get_city` returns the city profile. It includes status, realm, language,
timezone, official names, counts, visible bodies and parties, a city URL, and
`boundary: null | { geometryType, polygonCount }`. Counts follow the existing
released-meeting policy. The boundary summary describes stored geometry; it
does not return coordinates or measure the simplified map drawing.

`update_city` still accepts either verified `geojson` or `status: "demo"`.
It returns `{ city, changed, changes }`. `city` uses the same profile schema
and projection as the read. `changes` contains only changed fields, each with
before/after values. A boundary change can have identical before/after summaries
when coordinates changed but polygon type/count did not.

The transaction locks the city while comparing and writing. Equivalent
boundaries use PostGIS `ST_Equals`; existing demos are no-ops. No-ops preserve
`updatedAt` and cause no cache invalidation. Core city values and boundary
metadata in an update result come from its transaction snapshot; related
parties and visible bodies use the existing permission-aware reads.

## Compatibility

The structured wrapper serializes the same object into `structuredContent`
and a JSON text block. Notis prefers structured data and retains its text
fallback for older servers. Tool errors retain `isError` and their actionable
message rather than pretending to match a successful output schema.

The separate `feat/mcp-directory-listing` work disables analytics-injected
parameters/instructions and adds directory metadata and privacy safeguards.
Preserve those guards when integrating branches. The analytics compatibility
test here checks that declared output schemas and structured data survive
instrumentation; it does not replace the listing branch's no-injection tests.
