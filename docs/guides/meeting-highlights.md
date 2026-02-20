# Meeting Highlights

**Concept**

Create and share custom video clips from council meeting moments, with automatic generation and editing capabilities. The feature provides an intuitive multi-page interface for browsing, previewing, and managing highlights with advanced content editing, subject association capabilities, and flexible video generation options including social media formats.

**Architectural Overview**

The Meeting Highlights feature allows authorized users to select segments of a meeting's transcript and combine them into a single video file with customizable rendering options.

The architecture follows a page-based approach:
- `/highlights` - Lists all highlights with categorization
- `/highlights/[highlightId]` - Individual highlight detail view with responsive video player
- `/transcript?highlight=[id]` - Transcript page with editing mode activated

The process begins on the frontend, where a user selects utterances and configures video generation options. The request is sent to the backend, which first creates a `Highlight` record in the database, associating it with the selected `Utterance` records. It then dispatches a task to an external media processing server with link to the source video, utterances and timestamp information and rendering specifications. This server creates the highlight video with the specified format and options.

**Video Generation Features**

The system supports multiple video formats and rendering options:

### **Aspect Ratios**
- **Default (16:9)**: Traditional landscape format suitable for desktop viewing and standard video platforms
- **Social Media (9:16)**: Portrait format optimized for mobile-first social platforms like TikTok, Instagram Stories, and YouTube Shorts

### **Rendering Options**
- **Captions**: Overlaid text transcription of spoken content
- **Speaker Overlays**: Visual identification of speakers during their segments
- **Social Media Enhancements**: When using 9:16 format, additional options include:
  - Margin types: Blur or solid color backgrounds
  - Background color customization
  - Zoom factor adjustment for optimal video framing

### **Responsive Video Player**
The video player automatically adapts to different aspect ratios:
- **Dynamic Sizing**: Container adjusts based on video dimensions
- **Portrait Video Handling**: 9:16 videos are properly sized and centered
- **Responsive Layout**: Side-by-side content and video on desktop, stacked on mobile
- **Automatic Detection**: Video dimensions are detected on load for optimal display

**Sequence Diagram**

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Database
    participant Task Server

    User->>Frontend: Clicks "Create Highlight" button or right-clicks utterance
    Frontend->>Backend: upsertHighlight request with utterance IDs (empty or pre-selected)
    Backend->>Database: Creates `Highlight` and `HighlightedUtterance` records with auto-generated name
    Database-->>Backend: Returns new highlight ID
    Backend-->>Frontend: Returns new highlight ID
    Frontend->>Frontend: Enters editing mode on transcript page with highlight context
    User->>Frontend: Selects utterances in transcript view (edit mode)
    Frontend->>Backend: upsertHighlight on save or before generate (auto-save)
    User->>Frontend: Toggles preview and loops playback
    User->>Frontend: Configures video generation options (aspect ratio, captions, overlays)
    Frontend->>Backend: requestGenerateHighlight with rendering options
    Backend->>Task Server: Dispatches generateHighlight task with format specifications
    Task Server->>Database: Reads Highlight and Utterance data for timestamps
    Task Server-->>Task Server: Processes video file with specified format and options
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
│  [⭐ Create Highlight] [Share]                              │
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

### **Individual Highlight View with Responsive Video**
```
┌─────────────────────────────────────────────────────────────┐
│                    Highlight Details                        │
│  [← Back to Highlights] [Edit Content] [★] [Download] [🗑️] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Content & Video] - Responsive Layout                     │
│  ┌─────────────────┬─────────────────┐ (Desktop)           │
│  │ 📝 Content      │ 🎬 Video        │                     │
│  │ Preview         │ Player          │                     │
│  │                 │ (Auto-sizing)   │                     │
│  └─────────────────┴─────────────────┘                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### **Workflow Steps**

1. **Highlight Creation**: 
   - **Primary Method**: User clicks the "Create Highlight" button (⭐) in the header bar
   - **Context Menu Method**: User right-clicks on any utterance and selects "Ξεκινήστε Highlight από εδώ" (Start Highlight from here)
   - **List Method**: User clicks the "+ Add Highlight" button in the highlights list
   - Creates highlight with auto-generated name ("Unnamed Highlight") and immediately enters editing mode
   - If started from utterance, that utterance is pre-selected in the highlight
   - No dialog required - streamlined creation process
   - Routing example: `/[cityId]/[meetingId]/transcript?highlight=[id]`

2. **Content Editing**: 
   - User is in editing mode on the transcript page; `HighlightModeBar` appears
   - Click utterances in transcript to add/remove from highlight
   - **Range Selection**: Click an utterance, then Shift+Click another to select/deselect all utterances in between
   - Visual feedback: selected utterances are bold/underlined; amber overlays on the timeline
   - Real-time statistics update (duration, speaker count, utterance count)
   - Navigation controls: Previous/Next clip within the timeline controls (shows "Clip X/Y")
   - Unsaved changes are tracked; an "Unsaved Changes" badge appears
   - **Name and Subject Editing**: Click edit icon next to highlight name in mode bar
   - Save/Reset available via the overflow menu in `HighlightModeBar`
   - Exit Editing prompts if there are unsaved changes and returns to `/[cityId]/[meetingId]/highlights`

3. **Preview Mode**:
   - Click "Preview" button in `HighlightModeBar` to open the dedicated preview dialog
   - Dialog displays both video and text previews side-by-side with unified layout
   - Entering preview seeks to the first highlighted utterance and auto-plays
   - Auto-advancing playback through highlight segments; loops back to start
   - Video hover controls: large play/pause button appears on hover, click to toggle
   - Clip navigation controls positioned directly below the video player
   - Exiting preview pauses playback and closes the dialog

4. **Video Generation Configuration**:
   - Access generation options within the preview dialog
   - **Format Selection**: Choose between default (16:9) and social media (9:16) aspect ratios
   - **Content Options**: Toggle captions and speaker overlay features with text labels
   - **Social Media Enhancements**: When 9:16 format is selected, hardcoded options include:
     - Margin type: Blur effect (automatically applied)
     - Zoom factor: 1.0 (optimized for social media framing)
   - Settings are session-scoped and reset when dialog is closed

5. **Details Management**:
   - Navigate to `/[cityId]/[meetingId]/highlights/[highlightId]` to view full details
   - **Read-only display** with clear field labels (Name, Connected Subject, Showcased status)
   - **Single editing path**: All editing must be done through "Edit Highlight" button → transcript page
   - **Responsive Video Display**: Video player automatically adapts to aspect ratio
     - Portrait videos (9:16) are properly sized and centered
     - Landscape videos (16:9) use full container width
     - Responsive grid layout adapts to screen size

6. **Preview & Actions**:
   - **Dedicated Preview Dialog**: Unified interface for video and text preview with generation options
   - **Single Dialog Flow**: After clicking "Generate", dialog switches to status view with navigation options
   - **Generation Status**: Shows "Generation Started" message with multiple navigation choices:
     - Track Progress: Navigate to individual highlight page
     - View All Highlights: Navigate to highlights list
     - Return to Transcript: Continue editing
   - Generate/Re-generate auto-saves if there are unsaved changes before dispatching the task
   - Showcase toggle is available only when a video exists (`muxPlaybackId` set)
   - Video downloads respect the generated format and aspect ratio

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
- **Preview Button**: Opens dedicated preview dialog for video and text review
- **Navigation Controls**: Previous/next highlight navigation
- **Name/Subject Editing**: Edit icon next to highlight name opens dialog for name and subject updates
- **Save/Reset/Exit**: Save now, reset to original, and exit editing (with unsaved-changes prompt)

### **Categorization System**

Highlights are automatically categorized into three distinct sections:

1. **Showcased Highlights** (⭐): Featured highlights marked for special attention
2. **Video Highlights** (▶️): Non-showcased highlights that have generated videos (supports both 16:9 and 9:16 formats)
3. **Draft Highlights** (⏰): Highlights without videos, ready for content editing and generation

This categorization provides better organization and helps users understand the status of each highlight.

**Key Component Pointers**

*   **Data Models**:
    *   `Highlight`: `prisma/schema.prisma`
    *   `HighlightedUtterance`: `prisma/schema.prisma`
*   **Frontend Components**:
    *   `CouncilMeeting`: `src/components/meetings/CouncilMeeting.tsx`
    *   `HighlightsList`: `src/components/meetings/HighlightsList.tsx` (main list interface)
    *   `HighlightView`: `src/components/meetings/HighlightView.tsx` (individual highlight view with responsive video)
    *   `HighlightVideo`: `src/components/meetings/HighlightVideo.tsx` (adaptive video player with aspect ratio detection)
    *   `CreateHighlightButton`: `src/components/meetings/CreateHighlightButton.tsx` (streamlined highlight creation)
    *   `HighlightDialog`: `src/components/meetings/HighlightDialog.tsx` (create/edit dialog)
    *   `HighlightPreview`: `src/components/meetings/HighlightPreview.tsx` (content preview)
    *   `HighlightPreviewDialog`: `src/components/meetings/HighlightPreviewDialog.tsx` (dedicated preview dialog with video/text preview and generation options)
    *   `HighlightModeBar`: `src/components/meetings/HighlightModeBar.tsx` (streamlined editing interface with statistics, save/reset/exit, preview button, and guide)
    *   `HighlightGuideDialog`: `src/components/meetings/HighlightGuideDialog.tsx` (in-app user guide for highlights)
    *   `Utterance`: `src/components/meetings/transcript/Utterance.tsx` (enhanced with highlight selection and context menu creation)
    *   `TranscriptControls`: `src/components/meetings/TranscriptControls.tsx` (timeline visualization with clip navigation)
*   **State Management**:
    *   `HighlightContext`: `src/components/meetings/HighlightContext.tsx` (centralized highlight state, calculations, edit/preview lifecycle, save/reset/exit)
    *   `CouncilMeetingDataContext`: `src/components/meetings/CouncilMeetingDataContext.tsx` (centralized meeting data and highlight management with add/update/remove methods)
*   **Utilities**:
    *   `calculateHighlightData`: Integrated in `HighlightContext.tsx` (reusable calculations)
*   **Backend Logic**:
    *   `upsertHighlight`: `src/lib/db/highlights.ts`
    *   `deleteHighlight`: `src/lib/db/highlights.ts`
    *   `requestGenerateHighlight`: `src/lib/tasks/generateHighlight.ts` (enhanced with rendering options)
    *   `handleGenerateHighlightResult`: `src/lib/tasks/generateHighlight.ts`
*   **API Types**:
    *   `GenerateHighlightRequest`: `src/lib/apiTypes.ts` (includes aspect ratio and social media options)

**HighlightContext API (summary)**

- `enterEditMode(highlight)` — start editing lifecycle for a specific highlight
- `updateHighlightUtterances(utteranceId, 'add' | 'remove')` — modify composition in-memory and mark dirty
- `openPreviewDialog()` — open dedicated preview dialog; seeks and auto-plays first clip
- `closePreviewDialog()` — close preview dialog and pause playback
- `togglePreviewMode()` — toggle preview mode (now controls dialog state)
- `goToPreviousHighlight()` / `goToNextHighlight()` / `goToHighlightIndex(i)` — navigation; loops in preview, clamps in edit
- `saveHighlight(options?)` — persists current composition with optional name/subjectId updates; used explicitly or implicitly before generate
- `resetToOriginal()` — discard unsaved changes
- `exitEditMode()` — return to highlights list; prompts if unsaved changes
- `createHighlight(options)` — create new highlight with optional pre-selected utterance and callbacks
- `hasUnsavedChanges`, `isSaving`, `isCreating`, `isEditingDisabled`, `statistics`, `highlightUtterances`, `isPreviewDialogOpen`

**Business Rules & Assumptions**

*   Only authorized users can create, edit, or delete highlights.
*   Highlights can only be created for meetings that have a video file.
*   A highlight can be created with zero utterances initially, but must have at least one utterance before video generation.
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
*   **Video generation supports multiple aspect ratios and rendering options for different use cases.**
*   **Preview dialog provides unified interface** for video and text preview with generation options.
*   **Single dialog flow** switches from preview to status view after generation with navigation options.
*   **Highlight creation is streamlined with multiple entry points**: header button, context menu, and list button.
*   **Auto-generated names** ("Unnamed Highlight") simplify the creation process and can be edited later.
*   **Context menu integration** allows users to start highlights directly from any utterance in the transcript.
*   **Centralized editing workflow**: All highlight editing (content, name, subject) happens in transcript edit mode.
*   **Unified save functionality**: Single saveHighlight method handles both content and metadata updates with callbacks.