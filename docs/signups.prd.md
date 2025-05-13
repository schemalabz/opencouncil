# User Notification Signup System

## Overview

OpenCouncil provides a feature allowing users to sign up for notifications about topics discussed in city council meetings relevant to their neighborhoods and interests. This feature is only available for municipalities that have enabled it (tracked by the `supportsNotifications` boolean field in the City model).

## Database Schema Reference
- See `db/schema.prisma` for the complete data model

## Signup Flow

### Entry Point
- The landing page features a prominent CTA button labeled "Γραφτείτε στις ενημερώσεις" 
- This button directs users to the `/signup` page
- The signup experience is designed to be mobile-first, full-page, and app-like (no vertical scrolling)
- Users are simultaneously registered in the auth system (see `docs/auth.prd.md`)

### UI Design
- A Mapbox map serves as the background throughout the entire signup process
- Content is rendered directly on top of the map without cards or containers
- Because the default Mapbox map is bright, text and UI elements should be dark/black for contrast

### Stage 1: Municipality Selection
1. Users select a municipality from a filterable combobox
2. The combobox includes all Greek municipalities from our database
3. Selection of a municipality immediately advances the user to stage 2

### Stage 2: Municipality-specific Flow
Common elements for all municipalities:
- Municipality name and logo displayed in the header
- Map pans to show the municipality boundaries (polygon)

#### For Municipalities WITHOUT Notification Support:
1. **Officially Supported Cities** (`officialSupport = true`):
   - Display message: "This municipality does not support notifications yet (coming soon)"

2. **Unsupported Cities** (`officialSupport = false`):
   - Display message: "This municipality is not part of the OpenCouncil network"
   - Allow users to petition the city to join OpenCouncil
   - Collect:
     - User's full legal name
     - Two checkboxes: "Είμαι δημότης" and "Είμαι κάτοικος"

#### For Municipalities WITH Notification Support:
Users can select:
1. **Locations of Interest**:
   - Input field with Google API address autocomplete
   - Selected locations appear as badges/tags below the input with removal option (X)
   - Locations display as circles on the background map

2. **Topics of Interest**:
   - Input field with dropdown of topic labels from database
   - Selected topics appear as badges/tags below the input with removal option (X)

### Stage 3: User Registration
1. Display summary of selected preferences
2. Collect:
   - Email address (required)
   - Phone number (optional)
3. Complete the user registration process (as described in `docs/auth.prd.md`)
4. Create the appropriate database record:
   - For petitions: create a `Petition` record
   - For notifications: create a `NotificationPreference` record

## Data Models

### Petition
A user can have multiple petitions for different cities, but only one per city.
- Fields:
  - `user_id` (reference to User)
  - `city_id` (reference to City)
  - `created_at` (timestamp)
  - `updated_at` (timestamp)
  - `is_resident` (boolean)
  - `is_citizen` (boolean)

### NotificationPreference
A user can have multiple notification preferences for different cities, but only one per city.
- Fields:
  - `user_id` (reference to User)
  - `city_id` (reference to City)
  - `locations` (many-to-many relationship with Location model)
  - `interests` (many-to-many relationship with Topic model)
  - `created_at` and `modified_at`



