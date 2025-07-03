# PRD: Refactor ConsultationMap Component

**Status:** Draft
**Author(s):** Gemini, @kouloumos
**Relevant Issues:** N/A (Proactive Refactoring)

---

## 1. Background

The initial implementation of the Public Consultation feature was completed on a tight schedule to deliver core functionality. While successful, the primary user-facing component, `ConsultationMap.tsx`, has grown significantly in complexity. It currently manages a large amount of state, handles numerous side effects (like local storage and data fetching), and its logic is tightly coupled, making it difficult to maintain, test, and reason about.

This document outlines a plan to proactively address this technical debt, following the "first principles" of clean code and simple design.

## 2. Objective

The goal of this initiative is to refactor the `ConsultationMap` feature into a more modular, robust, and maintainable state. We will decompose the monolithic `ConsultationMap.tsx` component by extracting logic into custom hooks, separating concerns, and improving the overall architecture without altering existing functionality or the user experience.

## 3. Technical Implementation Plan

The refactoring will be executed in three distinct phases to ensure a structured and manageable process.

### Phase 1: Code Deconstruction & Relocation

This phase focuses on organizing the existing codebase by moving types and utility functions to centralized, feature-specific locations.

*   **Step 1.1: Centralize Type Definitions**
    *   **Action:** Create a new directory and file at `src/lib/consultations/types.ts`.
    *   **Action:** Move all type definitions and interfaces related to consultations from `src/components/consultations/types.ts` and `src/components/consultations/ConsultationMap.tsx` into this new file.
    *   **Action:** Update all imports across the feature to reference ` "@/lib/consultations/types"`.
    *   **Action:** Delete the now-empty `src/components/consultations/types.ts`.

*   **Step 1.2: Extract Utility Functions**
    *   **Action:** Create a new file at `src/lib/consultations/geometryUtils.ts`.
    *   **Action:** Move the pure geometric calculation functions (`createCircleBuffer`, `computeDerivedGeometry`, `createLocationLineFeatures`) from `ConsultationMap.tsx` into `geometryUtils.ts`.
    *   **Action:** Update imports accordingly.

### Phase 2: Logic Extraction into Custom Hooks

This phase is the core of the refactoring, where we will extract stateful logic into dedicated custom hooks to separate concerns.

*   **Step 2.1: Create `useEditedGeometries` Hook**
    *   **Action:** Create a new file at `src/hooks/consultations/useEditedGeometries.ts`.
    *   **Action:** Move the `savedGeometries` state and its related `localStorage` logic (loading, saving via `useEffect`, and the `handleDeleteSavedGeometry` function) from `ConsultationMap.tsx` into this hook.
    *   **Outcome:** This hook will encapsulate all interactions with `localStorage`, returning the `savedGeometries` state and a `deleteSavedGeometry` function.

*   **Step 2.2: Create `useConsultationMapState` Hook**
    *   **Action:** Create a new file at `src/hooks/consultations/useConsultationMapState.ts`.
    *   **Action:** Move the majority of the UI and interaction state from `ConsultationMap.tsx` into this new hook. This includes state for:
        *   Layer controls (`isControlsOpen`, `enabledGeoSets`, `enabledGeometries`, `expandedGeoSets`)
        *   Detail panel (`detailType`, `detailId`)
        *   Editing mode (`isEditingMode`, `drawingMode`, `selectedGeometryForEdit`)
        *   Map interaction (`selectedLocations`, `zoomGeometry`)
        *   Associated data (`cityData`)
    *   **Action:** Move all corresponding event handlers and effects (`toggleGeoSet`, `openDetailFromId`, `handleSelectGeometryForEdit`, `useEffect` for city data fetching, etc.) into the hook.
    *   **Outcome:** The hook will accept props it depends on (e.g., `regulationData`) and return a single state object containing all values and handlers needed by the UI components.

### Phase 3: Re-assemble the Main Component

With the logic extracted, we will refactor `ConsultationMap.tsx` to be a cleaner, simpler component that consumes our new hooks.

*   **Step 3.1: Refactor `ConsultationMap.tsx`**
    *   **Action:** Remove all logic that was moved into the new hooks and utility files.
    *   **Action:** Call `useEditedGeometries()` and `useConsultationMapState()` at the top of the component to get all necessary state and functions.
    *   **Action:** Update the component's `useMemo` for `mapFeatures` and the JSX to read from the state objects provided by the hooks.
    *   **Outcome:** A significantly smaller and more readable `ConsultationMap.tsx` component that primarily orchestrates UI based on the outputs of the new hooks.

## 4. Out of Scope

*   **No New Features:** This initiative is purely a refactor. No new user-facing features will be added.
*   **No UI/UX Changes:** The user interface and user experience will remain identical to the current implementation.
*   **No API Changes:** The backend API and data contracts will not be altered.

## 5. Risks & Mitigation

*   **Risk:** High chance of regression bugs due to the complexity of map interactions and admin editing flows.
    *   **Mitigation:** A thorough and disciplined manual testing process, as defined in the section below, is mandatory before merging.
*   **Risk:** The introduction of new abstractions (hooks) could add a minor learning curve for future developers.
    *   **Mitigation:** The simplification achieved by the refactor far outweighs this risk. The new hooks will be well-defined and located in a predictable `hooks/consultations` directory, improving overall discoverability and maintainability.

## 6. Verification & Testing Plan

The following user flows must be manually tested and verified to ensure the refactor was successful and introduced no regressions.

#### Core User Workflows

1.  **Layer Controls Interaction:**
    *   Verify the layer panel can be opened and closed.
    *   Verify that toggling a geoset shows/hides all its child geometries on the map.
    *   Verify that toggling an individual geometry correctly updates its visibility and the parent geoset's checkbox state (to "checked" or "indeterminate").

2.  **Detail Panel Navigation:**
    *   Verify clicking a geometry on the map opens the correct detail panel.
    *   Verify the URL is updated with a `#hash` when a detail panel opens.
    *   Verify refreshing the page with the hash in the URL opens the correct detail panel on load.
    *   Verify closing the detail panel removes the hash from the URL.

#### Administrator Editing Workflows

1.  **Editing Mode Lifecycle:**
    *   Verify toggling "Editing Mode" shows/hides the admin-specific UI.
    *   Verify selecting a geometry for editing opens the `EditingToolsPanel` and correctly auto-zooms the map.
    *   Verify exiting "Editing Mode" clears all editing state (e.g., selected geometry, drawn locations).

2.  **Geometry Creation & Deletion:**
    *   Verify a new point or polygon can be drawn for a geometry.
    *   Verify the newly drawn geometry appears on the map with the correct "edited" styling.
    *   Verify the layer list displays the "saved" (💾) icon next to the edited item.
    *   **Critical:** Verify that a hard page refresh correctly reloads the edited geometry from `localStorage`.
    *   Verify the "delete" functionality removes the edited geometry from both the map and `localStorage`. 