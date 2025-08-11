# Meeting Highlights

**Concept**

Create and share custom video clips from council meeting moments, with automatic generation and editing capabilities. The feature provides an intuitive two-panel interface for browsing, previewing, and managing highlights with advanced content editing and subject association capabilities.

**Architectural Overview**

The Meeting Highlights feature allows authorized users to select segments of a meeting's transcript and combine them into a single video file. The process begins on the frontend, where a user selects utterances and initiates the creation process. The request is sent to the backend, which first creates a `Highlight` record in the database, associating it with the selected `Utterance` records. It then dispatches a task to an external media processing server. This server retrieves the source video and the timestamp information from the database, creates the highlight video, and upon completion, updates the `Highlight` record with the URL to the new video.

**Sequence Diagram**

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Database
    participant Task Server

    User->>Frontend: Selects utterances and clicks "Create Highlight"
    Frontend->>Backend: `upsertHighlight` request with utterance IDs
    Backend->>Database: Creates `Highlight` and `HighlightedUtterance` records
    Database-->>Backend: Returns new highlight ID
    Backend-->>Frontend: Returns new highlight ID
    Frontend->>Backend: `requestSplitMediaFileForHighlight` with highlight ID
    Backend->>Task Server: Dispatches "splitMediaFile" task
    Task Server->>Database: Reads `Highlight` and `Utterance` data for timestamps
    Task Server-->>Task Server: Processes video file
    Task Server->>Backend: Webhook with video URL and Mux ID
    Backend->>Database: Updates `Highlight` with `videoUrl` and `muxPlaybackId`
```

**User Interaction Flow**

The enhanced highlight system provides an intuitive two-panel interface for creating and managing highlights with advanced editing capabilities:

### **Main Interface Layout**
```
┌─────────────────────────────────────────────────────────────┐
│                    Meeting Highlights                      │
│  Create and manage video highlights from this meeting...  │
├─────────────────────┬─────────────────────────────────────┤
│   Preview Panel     │         Highlight List              │
│   (Top on mobile)   │    (Bottom on mobile, left on XL)  │
│                     │                                     │
│ • Content Preview   │  • Highlight 1                     │
│ • Video Player      │  • Highlight 2                     │
│ • Actions           │  • Highlight 3                     │
│                     │                                     │
│                     │  [+ Add Highlight]                  │
└─────────────────────┴─────────────────────────────────────┘
```

### **Workflow Steps**

1. **Highlight Creation**: 
   - User clicks prominent "Add Highlight" button
   - Opens dialog with name input and subject selection
   - Uses `Combobox` component for intuitive subject search
   - Creates empty highlight ready for content editing

2. **Content Editing**: 
   - User clicks "Edit Content" button to enter editing mode
   - `HighlightModeBar` appears with real-time statistics and controls
   - Click utterances in transcript to add/remove from highlight
   - Visual feedback shows selected utterances in bold/underlined
   - Real-time statistics update (duration, speaker count, utterance count)
   - Navigation controls for moving between highlight segments

3. **Preview Mode**:
   - Toggle between edit and preview modes
   - Preview mode shows integrated content preview below the mode bar
   - Auto-advancing playback through highlight segments
   - Loop functionality for continuous preview
   - Navigation controls for manual segment navigation

4. **Details Management**:
   - User clicks edit icon next to highlight name/subject to modify details
   - Same dialog used for both create and edit modes
   - Subject connection with searchable dropdown
   - Clear visual feedback for connected subjects

5. **Preview & Actions**:
   - Real-time content preview with speaker grouping
   - Video generation and download options
   - Showcase toggle (only when video exists)
   - Subject badge display in preview header

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

**Key Component Pointers**

*   **Data Models**:
    *   `Highlight`: `prisma/schema.prisma`
    *   `HighlightedUtterance`: `prisma/schema.prisma`
*   **Frontend Components**:
    *   `CouncilMeeting`: `src/components/meetings/CouncilMeeting.tsx`
    *   `Highlights`: `src/components/Highlights.tsx` (main interface)
    *   `HighlightDialog`: `src/components/meetings/HighlightDialog.tsx` (create/edit dialog)
    *   `HighlightPreview`: `src/components/meetings/HighlightPreview.tsx` (content preview)
    *   `HighlightModeBar`: `src/components/meetings/HighlightModeBar.tsx` (editing interface with statistics and controls)
    *   `Utterance`: `src/components/meetings/transcript/Utterance.tsx` (enhanced with highlight selection)
    *   `TranscriptControls`: `src/components/meetings/TranscriptControls.tsx` (timeline visualization)
*   **State Management**:
    *   `HighlightContext`: `src/components/meetings/HighlightContext.tsx` (centralized highlight state and calculations)
*   **Utilities**:
    *   `calculateHighlightData`: Integrated in `HighlightContext.tsx` (reusable calculations)
*   **Backend Logic**:
    *   `upsertHighlight`: `src/lib/db/highlights.ts`
    *   `deleteHighlight`: `src/lib/db/highlights.ts`
    *   `requestSplitMediaFileForHighlight`: `src/lib/tasks/splitMediaFile.ts`
    *   `handleSplitMediaFileResult`: `src/lib/tasks/splitMediaFile.ts`

**Business Rules & Assumptions**

*   Only authorized users can create, edit, or delete highlights.
*   Highlights can only be created for meetings that have a video file.
*   A highlight must be associated with at least one utterance.
*   The external task server must have access to the database to retrieve the necessary information.
*   The application must expose a webhook endpoint for the task server to report the results of the video processing.
*   Only one highlight can be in editing mode at a time via the `HighlightContext`.
*   Changes to highlight composition are not persisted until the user explicitly saves via the "Save Changes" button.
*   Preview mode automatically advances through highlights and loops back to the beginning.
*   Subject connections are optional but provide better organization and discoverability.
*   Showcase toggle is only available when a video has been generated (`muxPlaybackId` exists).
*   Content calculations are performed lazily only when previewing highlights for performance.
*   Highlight editing mode provides real-time statistics and visual feedback for better user experience.
*   Navigation between highlight segments is available in both edit and preview modes.
*   The timeline visualization shows both speaker segments and highlight composition simultaneously.
*   Visual feedback includes color coding for speakers, highlight selection states, and interactive tooltips. 