# Meeting Highlights

**Concept**

Create and share custom video clips from council meeting moments, with automatic generation and editing capabilities. The feature provides an intuitive multi-page interface for browsing, previewing, and managing highlights with advanced content editing and subject association capabilities.

**Architectural Overview**

The Meeting Highlights feature allows authorized users to select segments of a meeting's transcript and combine them into a single video file. 

The architecture follows a page-based approach:
- `/highlights` - Lists all highlights with categorization
- `/highlights/[highlightId]` - Individual highlight detail view
- `/transcript?highlight=[id]` - Transcript page with editing mode activated

The process begins on the frontend, where a user selects utterances and initiates the creation process. The request is sent to the backend, which first creates a `Highlight` record in the database, associating it with the selected `Utterance` records. It then dispatches a task to an external media processing server. This server retrieves the source video and the timestamp information from the database, creates the highlight video, and upon completion, updates the `Highlight` record with the URL to the new video.

**Sequence Diagram**

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Database
    participant Task Server

    User->>Frontend: Clicks "Create New Highlight" on highlights page
    Frontend->>Backend: upsertHighlight request with utterance IDs (initially empty)
    Backend->>Database: Creates `Highlight` and `HighlightedUtterance` records
    Database-->>Backend: Returns new highlight ID
    Backend-->>Frontend: Returns new highlight ID
    Frontend->>Frontend: Redirects to /[cityId]/[meetingId]/transcript?highlight=[id]
    User->>Frontend: Selects utterances in transcript view (edit mode)
    Frontend->>Backend: upsertHighlight on save or before generate (auto-save)
    User->>Frontend: Toggles preview and loops playback
    Frontend->>Backend: requestSplitMediaFileForHighlight (Generate/Re-generate)
    Backend->>Task Server: Dispatches splitMediaFile task
    Task Server->>Database: Reads Highlight and Utterance data for timestamps
    Task Server-->>Task Server: Processes video file
    Task Server->>Backend: Webhook with video URL and Mux ID
    Backend->>Database: Updates Highlight with videoUrl and muxPlaybackId
    User->>Frontend: Navigates to /[cityId]/[meetingId]/highlights/[highlightId] to view results
```

**User Interaction Flow**

The enhanced highlight system provides an intuitive multi-page interface for creating and managing highlights with advanced editing capabilities:

### **Main Interface Layout**
```
┌─────────────────────────────────────────────────────────────┐
│                    Meeting Highlights                      │
│  Create and manage video highlights from this meeting...  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Showcased Highlights]                                    │
│  ┌─────────────┐ ┌─────────────┐                          │
│  │ Highlight 1 │ │ Highlight 2 │                          │
│  └─────────────┘ └─────────────┘                          │
│                                                             │
│  [Video Highlights]                                         │
│  ┌─────────────┐ ┌─────────────┐                          │
│  │ Highlight 3 │ │ Highlight 4 │                          │
│  └─────────────┘ └─────────────┘                          │
│                                                             │
│  [Draft Highlights]                                         │
│  ┌─────────────┐ ┌─────────────┐                          │
│  │ Highlight 5 │ │ Highlight 6 │                          │
│  └─────────────┘ └─────────────┘                          │
│                                                             │
│                    [+ Add Highlight]                       │
└─────────────────────────────────────────────────────────────┘
```

### **Individual Highlight View**
```
┌─────────────────────────────────────────────────────────────┐
│                    Highlight Details                        │
│  [← Back to Highlights] [Edit Content] [★] [Download] [🗑️] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Content & Video]                                          │
│  ┌─────────────────┬─────────────────┐                     │
│  │ 📝 Content      │ 🎬 Video        │                     │
│  │ Preview         │ Player          │                     │
│  │                 │                 │                     │
│  └─────────────────┴─────────────────┘                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### **Workflow Steps**

1. **Highlight Creation**: 
   - User clicks prominent "Create New Highlight" button on highlights page
   - Opens dialog with name input and subject selection
   - Uses `Combobox` component for intuitive subject search
   - Creates empty highlight and immediately redirects to the transcript page in editing mode
   - Routing example: `/[cityId]/[meetingId]/transcript?highlight=[id]`

2. **Content Editing**: 
   - User is in editing mode on the transcript page; `HighlightModeBar` appears
   - Click utterances in transcript to add/remove from highlight
   - Visual feedback: selected utterances are bold/underlined; amber overlays on the timeline
   - Real-time statistics update (duration, speaker count, utterance count)
   - Navigation controls: Previous/Next clip within the timeline controls (shows "Clip X/Y")
   - Unsaved changes are tracked; an "Unsaved Changes" badge appears
   - Save/Reset available via the overflow menu in `HighlightModeBar`
   - Exit Editing prompts if there are unsaved changes and returns to `/[cityId]/[meetingId]/highlights`

3. **Preview Mode**:
   - Toggle between edit and preview modes from `HighlightModeBar`
   - Entering preview seeks to the first highlighted utterance and auto-plays
   - Auto-advancing playback through highlight segments; loops back to start
   - Exiting preview pauses playback
   - Embedded content preview is shown inside the mode bar

4. **Details Management**:
   - Navigate to `/[cityId]/[meetingId]/highlights/[highlightId]` to view full details
   - Edit icons next to highlight name/subject open the same dialog used for create/edit
   - Subject connection with searchable dropdown; clear visual feedback for connected subjects

5. **Preview & Actions**:
   - Integrated content and video display (side-by-side on desktop, stacked on mobile)
   - Action buttons consolidated in the main action bar
   - Generate Video available; if a video already exists, the action is Re-generate
   - Generate/Re-generate auto-saves if there are unsaved changes before dispatching the task
   - Showcase toggle is available only when a video exists (`muxPlaybackId` set)

### **Visual Representation & Timeline**

The system provides multiple visual representations of highlight composition:

#### **Transcript Controls Timeline (`TranscriptControls.tsx`)**
- **Base Layer**: Speaker segments shown as colored bars with party colors
- **Highlight Layer**: Selected utterances overlaid as amber bars when editing
- **Interactive Elements**: 
  - Hover tooltips showing timestamp and speaker information
  - Click-to-seek functionality on timeline
  - Visual feedback for current scroll interval (yellow overlay)
  - Speaker selection highlighting with bounce animation
  - Inline clip navigation with "Previous/Next" and "Clip X/Y" indicator
- **Responsive Design**: Adapts between horizontal (desktop) and vertical (mobile) layouts

#### **Content Preview (`HighlightPreview.tsx`)**
- **Speaker Grouping**: Groups consecutive utterances by the same speaker
- **Gap Detection**: Shows visual indicators for breaks between utterances
- **Content Display**: Formatted text with speaker badges and utterance counts
- **Empty State**: Helpful messaging when no utterances are selected

#### **Mode Bar Integration (`HighlightModeBar.tsx`)**
- **Statistics Display**: Real-time duration, speaker count, and utterance count
- **Preview Integration**: Embedded content preview when in preview mode
- **Navigation Controls**: Previous/next highlight navigation
- **Mode Toggle**: Switch between edit and preview modes
- **Save/Reset/Exit**: Save now, reset to original, and exit editing (with unsaved-changes prompt)
- **Generate**: Generate/Re-generate video in preview mode; auto-saves when needed

### **Categorization System**

Highlights are automatically categorized into three distinct sections:

1. **Showcased Highlights** (⭐): Featured highlights marked for special attention
2. **Video Highlights** (▶️): Non-showcased highlights that have generated videos
3. **Draft Highlights** (⏰): Highlights without videos, ready for content editing

This categorization provides better organization and helps users understand the status of each highlight.

**Key Component Pointers**

*   **Data Models**:
    *   `Highlight`: `prisma/schema.prisma`
    *   `HighlightedUtterance`: `prisma/schema.prisma`
*   **Frontend Components**:
    *   `CouncilMeeting`: `src/components/meetings/CouncilMeeting.tsx`
    *   `HighlightsList`: `src/components/meetings/HighlightsList.tsx` (main list interface)
    *   `HighlightView`: `src/components/meetings/HighlightView.tsx` (individual highlight view)
    *   `HighlightDialog`: `src/components/meetings/HighlightDialog.tsx` (create/edit dialog)
    *   `HighlightPreview`: `src/components/meetings/HighlightPreview.tsx` (content preview)
    *   `HighlightModeBar`: `src/components/meetings/HighlightModeBar.tsx` (editing interface with statistics, save/reset/exit, preview, and generate)
    *   `Utterance`: `src/components/meetings/transcript/Utterance.tsx` (enhanced with highlight selection)
    *   `TranscriptControls`: `src/components/meetings/TranscriptControls.tsx` (timeline visualization with clip navigation)
*   **State Management**:
    *   `HighlightContext`: `src/components/meetings/HighlightContext.tsx` (centralized highlight state, calculations, edit/preview lifecycle, save/reset/exit)
    *   `CouncilMeetingDataContext`: `src/components/meetings/CouncilMeetingDataContext.tsx` (meeting data and highlights)
*   **Utilities**:
    *   `calculateHighlightData`: Integrated in `HighlightContext.tsx` (reusable calculations)
*   **Backend Logic**:
    *   `upsertHighlight`: `src/lib/db/highlights.ts`
    *   `deleteHighlight`: `src/lib/db/highlights.ts`
    *   `requestSplitMediaFileForHighlight`: `src/lib/tasks/splitMediaFile.ts`
    *   `handleSplitMediaFileResult`: `src/lib/tasks/splitMediaFile.ts`

**HighlightContext API (summary)**

- `enterEditMode(highlight)` — start editing lifecycle for a specific highlight
- `updateHighlightUtterances(utteranceId, 'add' | 'remove')` — modify composition in-memory and mark dirty
- `togglePreviewMode()` — preview selection; entering seeks and auto-plays first clip; exiting pauses
- `goToPreviousHighlight()` / `goToNextHighlight()` / `goToHighlightIndex(i)` — navigation; loops in preview, clamps in edit
- `saveHighlight()` — persists current composition; used explicitly or implicitly before generate
- `resetToOriginal()` — discard unsaved changes
- `exitEditMode()` — return to highlights list; prompts if unsaved changes
- `hasUnsavedChanges`, `isSaving`, `isEditingDisabled`, `statistics`, `highlightUtterances`

**Business Rules & Assumptions**

*   Only authorized users can create, edit, or delete highlights.
*   Highlights can only be created for meetings that have a video file.
*   A highlight must be associated with at least one utterance.
*   The external task server must have access to the database to retrieve the necessary information.
*   The application must expose a webhook endpoint for the task server to report the results of the video processing.
*   Only one highlight can be in editing mode at a time via the `HighlightContext`.
*   Changes to highlight composition are not persisted until saved (explicitly via Save or implicitly before Generate).
*   Exiting edit mode prompts the user if there are unsaved changes.
*   Preview mode automatically advances through highlights and loops back to the beginning.
*   Subject connections are optional but provide better organization and discoverability.
*   Showcase toggle is only available when a video has been generated (`muxPlaybackId` exists).
*   Content calculations are performed lazily only when previewing highlights for performance.
*   Highlight editing mode provides real-time statistics and visual feedback for better user experience.
*   Navigation between highlight segments is available in both edit and preview modes.
*   The timeline visualization shows both speaker segments and highlight composition simultaneously.
*   After creating a highlight, users are automatically redirected to editing mode on the transcript page.
*   Highlights are categorized into Showcased, Video, and Draft sections for better organization.
*   The interface uses Next.js App Router with dynamic routes for improved navigation and SEO.
*   Content preview and video player are integrated in a responsive grid layout for better mobile experience.
*   All action buttons are consolidated in the main action bar for consistency and ease of use. 