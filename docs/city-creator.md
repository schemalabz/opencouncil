# City Creator

## Overview
A city creator tool for superadmins to populate cities with real municipal data using AI-powered web search. Works on cities that have no existing data (meetings, parties, people, or roles), regardless of their pending status.

## How It Works

The system uses Claude Sonnet 4 with web search to find current information about Greek municipal councils, then generates a complete city structure with parties, people, and roles.

### Data Structure
- **Parties**: Political parties/coalitions in the council
- **Administrative Bodies**: Council, committees, communities  
- **People**: Council members, mayor, deputy mayors with embedded roles
- **Roles**: Three types embedded in person objects:
  - `party`: Party membership/leadership
  - `city`: Mayor, deputy mayor positions
  - `adminBody`: Administrative body membership

### User Flow
1. Superadmin navigates to city page (pending or non-pending with no data)
2. Clicks "Import Data" button (appears when city has no existing data)
3. Clicks "✨ Import with AI" button
4. AI searches web for municipal information using Greek queries
5. System generates data matching `json-schemas/city.schema.json`
6. User reviews/edits data in tabbed interface
7. Click "Save" to create all entities and activate city

## Technical Implementation

### Eligibility Check (`canUseCityCreator`)
- Centralized function checks if city can use creator
- Verifies city exists and has no existing data (parties, people, meetings, roles)
- Used across all API routes and UI components for consistency

### AI Generation (`/api/cities/[cityId]/populate/ai`)
- Uses eligibility check before proceeding
- Uses web search to find current council member data
- Handles incomplete information gracefully with null values
- Validates against JSON schema and business logic
- Searches for 15-30+ council members per municipality

### Editing Interface
- Full-screen modal with real-time stats dashboard
- Tabbed interface: General, Parties, Admin Bodies, People
- Inline editing with embedded role management
- Form validation and error handling

### Data Persistence (`/api/cities/[cityId]/populate`)
- Uses eligibility check before saving
- Single database transaction creates all entities
- Proper foreign key relationship handling
- Sets city as active upon completion

## Access & Security
- Superadmin permissions required
- Only works on cities with no existing data (meetings, parties, people, roles)
- Works on both pending and non-pending cities if they meet data criteria
- Development reset available with `IS_DEV` environment check

## Schema Design
The JSON schema is flexible to handle real-world data collection:
- Required fields: basic names and identifiers
- Optional fields accept null for missing information
- Embedded roles structure matches UI expectations
- Graceful degradation for incomplete data

This system enables rapid city setup with real municipal data rather than manual data entry, working seamlessly for both new pending cities and existing cities that need data population.
