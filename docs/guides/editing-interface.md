# Editing Interface

**Concept**

The Editing Interface allows authorized users to correct transcript text and reorganize the structure of meeting records. It provides inline text editing with full history tracking and structural tools to move utterances between speaker segments, ensuring accurate and verifiable meeting transcripts.

**Architectural Overview**

The system divides editing into distinct categories and modes:

1.  **Editing Mode Lifecycle**:
    *   **Activation**: Users enter "Editing Mode" via the `EditButton` in the global header. This activates `options.editable` in the `TranscriptOptionsContext`.
    *   **Context Bar**: When active, the `EditingModeBar` appears at the top of the transcript, providing specialized controls (Playback Speed, Next Unknown Speaker, Speakers Overview, Editing Guide, Exit).
    *   **Exclusivity**: Editing Mode is mutually exclusive with **Highlight Mode**. Users cannot create highlights while editing the transcript, and vice versa.

2.  **Text Content Editing** (in Editing Mode):
    *   Handled by the `Utterance` component in the transcript view.
    *   Users edit text directly inline. Browser-native spellcheck is enabled.
    *   **Visual Feedback**:
        *   **User Edited**: Distinguished by a **green underline** (`decoration-green-500`), making human verification immediately visible.
        *   **AI Corrected**: Distinguished by a **blue underline** (`decoration-blue-500`) for automated fixes.
    *   **Optimistic Updates**: Changes are reflected immediately in the UI while saving to the backend in the background, ensuring a responsive editing experience.
    *   Updates are sent to the backend via the `editUtterance` server action.
    *   **History Tracking**: Critical for auditability, every text change is logged in the `UtteranceEdit` table.

3.  **Structural Editing**:
    *   **Speaker Assignment**: The `PersonBadge` component handles speaker identification. It includes an explicit "Unknown Speaker" (`Άγνωστος Ομιλητής`) option and improved autocomplete to quickly assign speakers. The system can also auto-number unknown speakers (e.g., "Άγνωστος Ομιλητής 1").
    *   **Segment Operations**: Handled via context menus (e.g., "Move to Previous Segment").
    *   **Extract Segment**: Users can select a range of utterances (Shift+Click) within a segment and extract them into a new independent segment (useful for A-B-A speaker patterns).
        *   **Selection**: Visualized with bold text.
        *   **Validation**: Prevents extracting all utterances (leaving nothing behind) or extracting from the absolute start/end (which would be a simple split/move).
    *   Processed by `moveUtterancesToSegment` and `extractSpeakerSegment` in the backend.

4.  **Segment Management**:
    *   **Creation**: Users can create new empty speaker segments either after an existing segment or before the very first segment.
    *   **Adding Utterances to Empty Segments**:
        *   **Main UI (Primary Method)**: When editing mode is active and a segment has no utterances, an empty state UI is automatically displayed with a prominent "Add Utterance" button. Clicking this button:
            *   Creates a new empty utterance with timestamps calculated from the segment boundaries
            *   Start timestamp = segment start (or after the last utterance if segment is not empty)
            *   Duration = 1 second
            *   Immediately enables inline editing so the user can type the utterance text
            *   Uses the unified `addUtteranceToSegment` backend function
        *   **Adding to Non-Empty Segments**: A small inline "+" button appears at the end of each segment's text on hover, allowing users to naturally add new utterances at the end.
        *   **Advanced Method (Super Admin)**: The `SpeakerSegmentMetadataDialog` provides JSON-level editing for batch operations and complex edits.
    *   **Metadata Inspection**: Super Admins can view detailed metadata via the `SpeakerSegmentMetadataDialog`.
    *   **Advanced Editing**: The system supports complex segment updates via 
    `updateSpeakerSegmentData`, accessible through the metadata dialog. This allows:
        *   Batch updates of utterances (text, timestamps).
        *   **Adding Multiple Utterances**: Users can click "Add Empty Utterance" to append new 
        placeholder utterances to the segment's JSON data. The backend recognizes these via 
        temporary IDs (`temp_...`) and creates actual records.
        *   Deleting utterances (by removing them from the JSON array).
        *   Automatic recalculation of segment boundaries.

5.  **Automated Corrections**:
    *   Background tasks (like `fixTranscript`) can also modify utterances.
    *   These are treated similarly to user edits but are attributed to 'task' in the `lastModifiedBy` field and `UtteranceEdit` records.

6.  **Interaction Enhancements**:
    *   **Keyboard Shortcuts**: Centralized management via `KeyboardShortcutsContext` and `EditingContext`.
    *   **Selection Mode**: Managed via `EditingContext`. Supports **Shift+Click** for range selection (selecting multiple sequential utterances) and **Ctrl+Click** for toggling individual selections.
    *   **Speakers Overview**: A dedicated sheet (`SpeakersOverviewSheet`) provides real-time statistics (duration, segment count) and navigation for every speaker in the meeting.
    *   **In-App Guide**: A comprehensive `EditingGuideDialog` provides immediate access to shortcuts and workflow instructions.

**Shortcuts Reference**

| Category | Key(s) | Action |
| :--- | :--- | :--- |
| **Playback** | `Space` | Play / Pause |
| | `ArrowLeft` | Seek to previous utterance |
| | `ArrowRight` | Seek to next utterance |
| | `ArrowUp` | Increase Playback Speed |
| | `ArrowDown` | Decrease Playback Speed |
| **Editing** | `Enter` | Edit active utterance / Save & Close |
| | `Escape` | Cancel text edit |
| **Selection** | `Shift + Click` | Select Range of Utterances |
| | `Ctrl + Click` | Toggle Selection of Utterance |
| | `e` | Extract selected utterances to new segment |
| | `Escape` | Clear selection |
| **Global** | `Ctrl + b` | Toggle Sidebar |

**Sequence Diagram**

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Database

    %% Mode Activation
    User->>Frontend: Clicks "Enable Editing" (EditButton)
    Frontend->>Frontend: Sets options.editable = true
    Frontend->>Frontend: Shows EditingModeBar (Speed, Unknown Speaker controls)

    %% Text Editing Flow
    User->>Frontend: Clicks "Edit" on Utterance
    Frontend->>Frontend: Enters inline edit mode
    User->>Frontend: Modifies text and saves
    Frontend->>Backend: editUtterance(utteranceId, newText)
    Backend->>Database: CREATE UtteranceEdit & UPDATE Utterance
    Backend-->>Frontend: Return updated Utterance

    %% Structural Editing Flow
    User->>Frontend: Selects "Move to Previous Segment"
    Frontend->>Backend: moveUtterancesToPreviousSegment(utteranceId)
    Backend->>Database: UPDATE Utterance & Segment Timestamps
    Backend-->>Frontend: Return updated Segments

    %% Segment Creation Flow
    User->>Frontend: Clicks "Add segment before/after"
    Frontend->>Backend: createEmptySpeakerSegmentBefore/After()
    Backend->>Database: CREATE SpeakerTag & SpeakerSegment
    Backend-->>Frontend: Return new Segment

    %% Add Utterance to Segment Flow
    User->>Frontend: Clicks "Add Utterance" (empty segment or hover button)
    Frontend->>Backend: addUtteranceToSegment(segmentId)
    Backend->>Backend: Calculate timestamps (segment start if empty, after last utterance otherwise)
    Backend->>Database: CREATE Utterance with calculated timestamps
    Backend->>Database: UPDATE Segment end timestamp if needed
    Backend-->>Frontend: Return updated Segment with new Utterance
    Frontend->>Frontend: Automatically enter edit mode on new utterance

    %% Extraction Flow
    User->>Frontend: Selects utterances (Shift+Click)
    User->>Frontend: Presses 'e' or clicks "Extract Segment"
    Frontend->>Backend: extractSpeakerSegment(segmentId, startId, endId)
    Backend->>Database: Split segments & reassign utterances
    Backend-->>Frontend: Return updated segments list

    %% Advanced Segment Editing
    User->>Frontend: Opens Metadata Dialog & Clicks "Add Empty Utterance"
    Frontend->>Frontend: Appends new utterance w/ temp ID to JSON editor
    User->>Frontend: Modifies JSON and Submits
    Frontend->>Backend: updateSpeakerSegmentData(segmentId, data)
    Backend->>Backend: Validate timestamps & content
    Backend->>Database: Transaction: Delete removed / Update existing / Create temp_ utterances
    Backend->>Database: Recalculate Segment Timestamps
    Backend-->>Frontend: Return updated Segment
```

**Key Component Pointers**

*   **Data Models**:
    *   `Utterance`: [`prisma/schema.prisma`](../../prisma/schema.prisma)
    *   `UtteranceEdit`: [`prisma/schema.prisma`](../../prisma/schema.prisma)
    *   `SpeakerSegment`: [`prisma/schema.prisma`](../../prisma/schema.prisma)

*   **Frontend Components**:
    *   `EditingModeBar`: [`src/components/meetings/EditingModeBar.tsx`](../../src/components/meetings/EditingModeBar.tsx) (Contextual bar with tools and navigation)
    *   `SpeakersOverviewSheet`: [`src/components/meetings/transcript/SpeakersOverviewSheet.tsx`](../../src/components/meetings/transcript/SpeakersOverviewSheet.tsx) (Speaker statistics and navigation)
    *   `EditingGuideDialog`: [`src/components/meetings/EditingGuideDialog.tsx`](../../src/components/meetings/EditingGuideDialog.tsx) (In-app user guide)
    *   `EditButton`: [`src/components/meetings/EditButton.tsx`](../../src/components/meetings/EditButton.tsx) (Entry point in global header)
    *   `TranscriptControls`: [`src/components/meetings/TranscriptControls.tsx`](../../src/components/meetings/TranscriptControls.tsx) (Video player and clip navigation)
    *   `Utterance`: [`src/components/meetings/transcript/Utterance.tsx`](../../src/components/meetings/transcript/Utterance.tsx) (Inline editing, visual state)
    *   `PersonBadge`: [`src/components/persons/PersonBadge.tsx`](../../src/components/persons/PersonBadge.tsx) (Speaker autocomplete and assignment)
    *   `SpeakerSegment`: [`src/components/meetings/transcript/SpeakerSegment.tsx`](../../src/components/meetings/transcript/SpeakerSegment.tsx) (Displays empty state UI with "Add Utterance" button via `EmptySegmentState` component)

*   **State & Context**:
    *   `TranscriptOptionsContext`: [`src/components/meetings/options/OptionsContext.tsx`](../../src/components/meetings/options/OptionsContext.tsx) (Manages `editable` state)
    *   `CouncilMeetingDataContext`: [`src/components/meetings/CouncilMeetingDataContext.tsx`](../../src/components/meetings/CouncilMeetingDataContext.tsx)
    *   `EditingContext`: [`src/components/meetings/EditingContext.tsx`](../../src/components/meetings/EditingContext.tsx) (Manages utterance selection state and extraction logic)
    *   `KeyboardShortcutsContext`: [`src/contexts/KeyboardShortcutsContext.tsx`](../../src/contexts/KeyboardShortcutsContext.tsx) (Centralized keyboard shortcut management)

*   **Backend Logic**:
    *   `editUtterance`: [`src/lib/db/utterance.ts`](../../src/lib/db/utterance.ts)
    *   `moveUtterancesToSegment`: [`src/lib/db/speakerSegments.ts`](../../src/lib/db/speakerSegments.ts)
    *   `extractSpeakerSegment`: [`src/lib/db/speakerSegments.ts`](../../src/lib/db/speakerSegments.ts) (Handles extracting utterance ranges into new segments)
    *   `createEmptySpeakerSegmentBefore/After`: [`src/lib/db/speakerSegments.ts`](../../src/lib/db/speakerSegments.ts) (Handles creating new segments with "New speaker segment" tag)
    *   `addUtteranceToSegment`: [`src/lib/db/speakerSegments.ts`](../../src/lib/db/speakerSegments.ts) (Unified function for adding utterances to any segment - handles both empty and non-empty cases with automatic timestamp calculation)
    *   `updateSpeakerSegmentData`: [`src/lib/db/speakerSegments.ts`](../../src/lib/db/speakerSegments.ts) (Handles batch updates, utterance creation/deletion via temp IDs, and timestamp recalculation - used for advanced editing)

**Business Rules & Assumptions**

*   **Authorization**: Only authorized users (admin/editor permissions for the city) can perform edits. Authorization is checked via `withUserAuthorizedToEdit`.
*   **History Immutability**: `UtteranceEdit` records are never updated or deleted; they serve as a permanent audit log.
*   **Structural Integrity**: Moving utterances must maintain the chronological order of timestamps within segments. The backend logic automatically adjusts segment start/end timestamps to boundary utterances.
*   **Segment Creation**:
    *   Creating a segment *after* an existing one sets its start time to the previous segment's end time (+0.01s).
    *   Creating a segment *before* the first segment is only possible if there is available time (start > 0). It defaults to a small duration before the first segment's start.
*   **Adding Utterances to Segments**:
    *   Available for both empty and non-empty segments via `addUtteranceToSegment`.
    *   Timestamps are automatically calculated:
        *   **Empty segment**: `start = segment.startTimestamp`, `duration = min(1 second, segment duration)`
        *   **Non-empty segment**: `start = last utterance's end timestamp`, `duration = 1 second`
        *   If the new utterance extends beyond the segment's end, the segment's `endTimestamp` is automatically updated.
        *   `end = start + duration`
    *   After creation, the utterance is immediately editable inline (frontend automatically focuses the new utterance).
*   **Complex Segment Edits**: When updating a whole segment via `updateSpeakerSegmentData`, at least one utterance must remain. Timestamps must be valid (start < end).
    *   New utterances added via the JSON editor use temporary IDs (starting with `temp_`) which are detected by the backend and replaced with real DB records.
*   **Edit Attribution**: All text edits must be attributed to either a specific `User` or a `task`.
