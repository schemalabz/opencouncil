# City Creator

## Overview
Build a city creator tool for superadmins to populate pending cities with municipal data. Only works on cities where `isPending = true` and no related data exists (meetings, people, parties, roles).

## Data Structure (see schema.prisma)
- **City**: Main entity with `isPending` flag
- **AdministrativeBody**: Council, committee, or community entities
- **Party**: Political parties with colors and logos
- **Person**: People with roles in the city
- **Role**: Connects persons to cities/parties/administrative bodies

## Implementation Parts

### 1. AI Fill-in (Future Release)
- **Current**: Return empty council JSON structure
- **Future**: Web search for municipal information
- **Output**: JSON matching `json-schemas/city.schema.json`

### 2. Editing UI
- **Location**: Single-screen interface
- **Features**:
  - Stats display: councillor count, party count, role count
  - Edit all JSON fields inline
  - Real-time JSON updates in browser
- **Access**: Import button on city page (superadmins only)

### 3. Saving
- **Process**: Single database transaction
- **Actions**:
  - Save JSON data to database using Prisma
  - Set `city.isPending = false`
- **Result**: City becomes active and visible

## Entry Point
Main city page → Import button (visible to superadmins only)

## Technical Notes
- Browser-only data storage during editing
- JSON schema validation required
- Use Prisma API for database operations
