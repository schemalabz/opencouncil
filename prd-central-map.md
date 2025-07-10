# PRD: Central Interactive Map (`opencouncil.gr/map`)

**Version:** 1.0
**Status:** Scoping
**Author:** AI Co-Pilot

---

## 1. Introduction & Goal

This document outlines the requirements for a new feature: a central, interactive map at `/map`. This map will serve as the primary interface for citizens to visually explore and understand the activities of city councils across all supported municipalities. The goal is to create a simple, modern, and highly-performant user experience that aligns with the existing technical architecture of the OpenCouncil platform.

## 2. Problem Statement

Currently, citizens who want to understand council activities in their region must manually navigate to each municipality's page. There is no unified, geographically-oriented view to discover subjects being discussed in their immediate vicinity or in neighboring areas. This creates a barrier to civic engagement and makes it difficult to see the broader context of local governance.

## 3. User Story

-   **As a citizen, I want to explore council subjects on a map so that I can easily discover what is being discussed in my own and nearby municipalities.**

## 4. Functional Requirements

The map will have two primary modes, selectable by the user.

#### 4.1. Subjects Mode

This mode will display the locations of specific subjects discussed in council meetings.

-   **Data Display**: Subjects with a defined location will be rendered as points (or potentially polygons) on the map.
-   **Interactivity**: Clicking on a subject's map feature will navigate the user to that subject's detailed page.
-   **Filtering Controls**:
    -   **Date Range Picker**: Allows users to select a start and end date to filter subjects. Defaults to the last 6 months.
    -   **Category Picker**: A dropdown to filter subjects by their assigned topic/category.
    -   **Municipality Picker**: A dropdown to focus the map and subjects on one or more selected municipalities.
    -   **"Long Discussions Only" Flag**: A checkbox/toggle that, when enabled, filters for subjects with a total discussion time of 5 minutes or more.

#### 4.2. Municipalities Mode

This mode provides a high-level overview of municipal engagement on the platform.

-   **Supported Municipalities**: Displayed as polygons with a distinct visual style (e.g., orange fill).
-   **Unsupported Municipalities**: Displayed as polygons with a different visual style (e.g., shades of blue), where the color intensity corresponds to the number of petitions submitted for that municipality.

## 5. Non-Functional Requirements

-   **Performance**: The map must load quickly and remain responsive, even with a large number of features. Initial data load should be optimized, and filtering should feel instantaneous.
-   **Responsiveness**: All map controls and features must be fully functional and user-friendly across desktop and mobile devices.
-   **Consistency**: The map's visual design and user experience should be consistent with the rest of the OpenCouncil application.
-   **Accessibility**: Map controls must be keyboard-accessible and adhere to WCAG 2.1 guidelines.

## 6. Technical Implementation Plan

This feature will be implemented by leveraging the existing, robust mapping infrastructure. No new core technologies are required.

#### 6.1. File Structure

-   **New Page**: `src/app/[locale]/map/page.tsx`
-   **New Data-Fetching Module**: `src/lib/map-data.ts`

#### 6.2. Frontend Implementation (`page.tsx`)

-   **Core Component**: The existing `<Map>` component from `src/components/map/map.tsx` will be used to render all map features.
-   **State Management**: React hooks (`useState`, `useEffect`) will manage the UI state, including the current map mode and all filter values.
-   **UI Controls**: Existing UI components (from `src/components/ui/`) will be used to build the filter bar (e.g., `Select` for pickers, `DateRangePicker`, `Checkbox`).
-   **Data Flow**:
    1.  The page component will fetch data from the backend using the functions defined in `src/lib/map-data.ts`.
    2.  A client-side transformation function will convert the fetched data into the `MapFeature[]` array required by the `<Map>` component's `features` prop.
    3.  The `onFeatureClick` prop will be used to handle navigation when a user clicks a subject feature.
    4.  `useEffect` hooks will trigger data re-fetching when any filter state changes.

#### 6.3. Backend & Data-Sourcing (`map-data.ts`)

To avoid redundant code, this module will reuse existing low-level database queries where possible.

-   **`getSubjectsForMap(filters)`**:
    -   **Source**: Will call `getAllSubjects()` from `src/lib/db/subject.ts`.
    -   **Logic**:
        -   Applies filtering based on the `date`, `category`, and `municipality` parameters.
        -   Calculates subject duration from the `speakerSegments` relation to handle the "long discussion" filter.
        -   Transforms the final data into a GeoJSON-compatible format, extracting coordinates from the `location` relation as seen in `getSubjectsForMeeting`.

-   **`getMunicipalitiesForMap()`**:
    -   **Source**: Will call a function like `getCities()` from `src/lib/db/cities.ts`.
    -   **Logic**:
        -   Will require a new or modified query to fetch petition counts alongside municipality data.
        -   Maps over the data, assigning styles (fill color, opacity) based on whether a municipality is supported and its petition count.

## 7. Out of Scope for Version 1.0

-   Real-time map updates via WebSockets.
-   Advanced geospatial visualizations like heatmaps or cluster analysis.
-   Saving user-defined filter sets.
-   User-generated map annotations or comments. 