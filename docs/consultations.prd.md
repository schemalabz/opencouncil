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
- Full-screen interactive map display
- Visualizes geographic elements of the regulation

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