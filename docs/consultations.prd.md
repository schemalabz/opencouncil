# Public Consultation Tool for Local Government Regulations

This module of OpenCouncil is a tool for public consultations on regulatory texts.

A regulation is a document with chapters, articles and locations. A user can view the document, as well as the embedded locations on a map.

Essentially the tool is a viewer for JSON files that follow the regulation JSON schema (`./regulation.schema.json`). Users will later be able to leave comments and upvote the comments of others.

## How It Works

### Regulation Structure
A regulation contains:
- **Chapters** with introductory text and articles
- **Articles** with markdown content
- **Geographic areas** (points, circles, polygons) organized in geosets
- **Cross-references** linking text to locations using `{REF:id}` syntax

### User Experience
Users can:
- **Read the regulation** in a structured text view with expandable chapters
- **Explore locations** on an interactive map
- **Navigate seamlessly** between text and map via reference links
- **Comment** on specific articles or geographic areas (future feature)

### Reference System
Text can reference other parts of the regulation:
- `{REF:prohibited_areas}` → links to a set of geographic areas
- `{REF:akademia_platonos}` → links to a specific location
- `{REF:traffic_rules}` → links to a chapter
- `{REF:general_provisions}` → links to an article

When clicked, these references navigate users to the appropriate view (text or map).
### Permanent Links
Permanent links (permalinks) are essential for the consultations module to enable direct access and sharing of specific content. The system provides permalinks for:

* The complete consultation view (defaults to showing the map)
* The dedicated map visualization
* Individual chapters within the regulation
* Specific articles
* Geographic area sets (geosets)
* Individual geographic elements (polygons or points) within geosets
* User-submitted comments and feedback

Elements with permalinks should display a clickable icon that shows a "Copy link" tooltip on hover. After clicking, a confirmation message "Ο σύνδεσμος αντιγράφηκε" appears to indicate successful copying.

### Public Feedback System (future feature)
The consultation platform will enable public comments and feedback on:

* Regulation chapters
* Individual articles
* Sets of geographic areas (geosets)
* Specific locations and boundaries within geographic sets

## Consultation Page Interface

The consultation interface prioritizes a clean, responsive design that works seamlessly across all devices. The interface consists of two main views:
### Map View
The map view provides a full-screen interactive map interface that visualizes the geographic elements defined in the regulation. Key features include:

**Interactive Layer Control**
- Overlay UI for managing map visibility
- Hierarchical selection of geosets and individual geographic areas
- Toggle controls for both entire geosets and specific areas
- Mobile-optimized with collapsible UI behind a button

**Geographic Elements**
- Geosets (e.g. prohibited_areas) containing multiple related areas
- Individual geographic areas as polygons or points (e.g. koukaki, central_park)
- Clear visual distinction between different types of areas

**Detail Panel**
- Sliding panel interface for viewing area details
- Displays additional information about selected geosets/areas
- Integrated commenting system for public feedback
- Smooth transitions between map and detail views

The interface prioritizes mobile usability while maintaining full functionality across all devices. The overlay controls intelligently adapt to screen size to maximize map visibility while keeping all features easily accessible.



### Document View  
- Structured display of regulation text and content
- Expandable chapters and articles with preview summaries
- Collapsed by default to provide clear document overview
- Click to expand sections and view full content

A floating action button in the brand color sits in the bottom right corner, allowing users to toggle between views with a single tap.

### Common Elements
Both views share a minimal header containing:
- Consultation title
- Description
- Comment count
- End date
- Active status indicator

The interface emphasizes:
- Intuitive navigation
- Mobile-first design
- Clean visual hierarchy
- Shareable deep links

## Athens Scooter Regulation Example

The initial implementation uses Athens' electric scooter regulation, which demonstrates the tool's capabilities:

**Content Structure:**
- General provisions (purpose, definitions, scope)
- Traffic rules with speed limits and restrictions  
- Parking regulations and designated zones
- Penalties and enforcement procedures

**Geographic Elements:**
- Prohibited areas (archaeological sites, hills, sensitive zones)
- Pedestrian speed zones (historic center, commercial streets)
- Designated parking locations throughout the city

**Reference Integration:**
- Articles about restrictions reference specific prohibited areas on the map
- Parking rules link to designated zones shown geographically
- Speed limit articles reference pedestrian-only zones

## User Interface

### Text View
- Hierarchical display of chapters and articles
- Clickable reference links that jump to map or other sections
- Comment indicators showing engagement per article
- Expandable sections for easy navigation

### Map View
- Interactive geographic areas with different visual styles
- Click areas to see related regulation text
- Layer controls to show/hide different area types
- Location details and related articles in popups

### Navigation
- Smooth transitions between text and map views
- Breadcrumb navigation within the regulation hierarchy
- Search functionality to find specific content
- Mobile-responsive design for accessibility

## Administrator Tools

To facilitate the rapid setup and maintenance of a consultation, especially when dealing with complex geographic data, a suite of administrator-only tools is required. These tools will be accessible to authenticated users with appropriate permissions directly within the consultation interface.

### Map-Based Geolocation Editor

A significant challenge in digitizing regulations is that many geographic boundaries are defined textually (e.g., "the area enclosed by the intersections of streets A, B, and C") rather than with explicit coordinates. The Map-Based Geolocation Editor is a crucial tool for administrators to convert these textual descriptions into valid GeoJSON data directly on the map.

**Problem:** Geometries in the source `regulation.json` file often have a `textualDefinition` but a `null` `geojson` property, preventing them from being displayed on the map.

**Solution:** A comprehensive, real-time, in-map editing interface for administrators.

**Key Features:**

- **Visual Status System:** Clear indicators show geometry status (original data ✓, locally saved 💾, missing ⚠️, selected for editing 🎯)
- **Contextual Help:** Textual definitions display directly in the editing interface for reference while drawing
- **Auto-Zoom:** Automatic map focus when selecting geometries for editing
- **Local Storage Persistence:** Changes saved locally with real-time preview before final export
- **Complete Export Workflow:** One-click export of complete regulation.json with all edits merged
- **Professional Drawing Tools:** Powered by Mapbox GL Draw with custom styling for points and polygons

**User Flow:**

1.  **Access Editing Mode:** Super administrators see an "Λειτουργία Επεξεργασίας" toggle button in the layer controls panel. Regular users cannot access editing functionality.

2.  **Activate Editing:** Clicking the toggle enables editing mode, which:
    *   Displays street name labels on the map for better orientation
    *   Shows edit buttons next to geometries that lack coordinate data
    *   Reveals drawing tools and export functionality

3.  **Select Geometry for Editing:** Administrators click the edit button (✏️) next to any geometry. This:
    *   Auto-zooms the map to show the geometry if it already has coordinates
    *   Highlights the geometry entry with a blue background
    *   Displays the textual definition in the editing panel for reference
    *   Activates drawing mode for that specific geometry

4.  **Choose Drawing Mode:** Select between:
    *   **Σημείο (Point):** For single location markers
    *   **Περιοχή (Polygon):** For area boundaries

5.  **Draw Geometry:**
    *   **For Points:** Click once on the map to place the location
    *   **For Polygons:** Click multiple points to define the boundary, with visual feedback during drawing
    *   The textual definition remains visible for reference throughout the drawing process

6.  **Automatic Saving:** Drawn geometries are immediately:
    *   Saved to browser localStorage with the geometry ID
    *   Displayed on the map with blue styling to distinguish from original data
    *   Indicated with a save icon (💾) in the geometry list

7.  **Edit Management:**
    *   **Visual Feedback:** Geometries show their current status in the layer controls
    *   **Delete Option:** Locally saved geometries can be deleted with confirmation dialog
    *   **Real-time Preview:** Changes appear immediately on the map and in detail panels

8.  **Export Complete Data:** The "Εξαγωγή Regulation.json" button:
    *   Merges all local edits with the original regulation data
    *   Downloads a complete, production-ready regulation.json file
    *   Shows count of edited geometries in the button label
    *   Generates timestamped filename for version control

**Technical Implementation:**
- **State Management:** Event-driven localStorage synchronization for real-time updates
- **Drawing Engine:** Mapbox GL Draw with custom styling (blue for inactive, orange for active)
- **Zoom Integration:** Automatic bounds calculation and map fitting for geometry focus
- **Export System:** Deep merging of original data structure with local edits
- **Performance Optimized:** Minimal re-renders with smart state comparison

**Workflow Benefits:**
- **Non-destructive:** Original data remains unchanged until export
- **Visual Confirmation:** Immediate feedback for all actions
- **Context-aware:** Textual definitions provide guidance during drawing
- **Production-ready:** Complete export process for deployment
- **User-friendly:** Intuitive interface with clear status indicators

This comprehensive editor transforms the complex task of geocoding textual definitions into an intuitive, guided workflow that ensures accurate geographic data while maintaining a professional administrative interface.

## Future Features

### Comment System
- Citizens can comment on specific articles or geographic locations
- Voting system for community feedback prioritization
- Moderation workflow for municipal review
- Integration with municipal email systems

### Advanced Functionality
- Multi-regulation support for different municipal policies
- Comparison tools for regulation versions
- Analytics dashboard for citizen engagement
- Export capabilities for municipal reporting

## Development Approach

The tool prioritizes simplicity and practical functionality over complex features. Starting with the Athens scooter regulation provides a concrete use case to validate the approach before expanding to other regulatory types.

The JSON schema ensures consistency while remaining flexible enough to accommodate different regulation structures and requirements across various municipalities.