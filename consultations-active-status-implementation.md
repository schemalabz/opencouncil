# Consultation Active/Inactive Status Implementation

This document summarizes the implementation of active/inactive consultation status functionality based on both the `isActive` flag and `endDate` field.

## Overview

A consultation is considered **active** only when:
1. The `isActive` flag is `true` AND
2. The `endDate` is in the future (greater than current date/time)

If either condition is false, the consultation is considered **inactive**.

## Changes Made

### 1. Server-Side Changes (`src/lib/db/consultations.ts`)

#### New Helper Function
- Added `isConsultationActive(consultation: Consultation): boolean` function that checks both `isActive` flag and `endDate`

#### New Type
- Added `ConsultationWithStatus` type that extends `Consultation` with `isActiveComputed: boolean` property

#### Updated Functions
- **`getConsultationById`**: Now returns `ConsultationWithStatus` with computed active status
- **`addConsultationComment`**: Added validation to prevent comments on inactive consultations
- **`getConsultationsForCity`**: Modified to show all consultations (including expired ones) for better UX
- **Email sending**: Only sends emails for active consultations

### 2. API Route Changes (`src/app/api/consultations/[id]/comments/route.ts`)

#### Server-Side Validation
- Added consultation active status check before allowing new comments
- Returns 403 error with message "This consultation is no longer accepting comments" for inactive consultations

### 3. UI Component Changes

#### `ConsultationHeader.tsx`
- Added `isActiveComputed` prop to accept computed active status
- Updated badge display to use computed status instead of just the `isActive` flag

#### `CommentSection.tsx`
- Added `consultationIsActive` prop to control comment submission
- Added visual indicator (clock icon) when consultation has expired
- Disabled comment form and submit button for inactive consultations
- Shows appropriate message: "Η διαβούλευση έχει λήξει"

#### `CityConsultations.tsx`
- Updated to use `isConsultationActive()` helper function
- Shows proper active/inactive status in consultation cards

#### `ConsultationViewer.tsx`
- Updated `Consultation` interface to include `isActiveComputed` property
- Passes computed active status to both `ConsultationHeader` and `ConsultationDocument`

#### `ConsultationDocument.tsx`
- Added `consultationIsActive` prop
- Passes active status down to `ChapterView` and `ArticleView` components

#### `ChapterView.tsx` & `ArticleView.tsx`
- Added `consultationIsActive` prop
- Passes active status to their respective `CommentSection` components

### 4. User Experience Improvements

#### Visual Indicators
- **Active consultations**: Green "Ενεργή" badge
- **Inactive consultations**: Gray "Ανενεργή" badge
- **Expired comment sections**: Clock icon with explanatory message

#### Comment Functionality
- **Active consultations**: Full comment functionality (create, upvote, delete)
- **Inactive consultations**: 
  - View existing comments only
  - Comment form disabled with clear message
  - No new comments or email notifications

#### Error Handling
- Clear error messages when trying to comment on inactive consultations
- Graceful degradation of functionality

## API Behavior

### GET `/api/consultations/[id]/comments`
- No changes - returns all comments regardless of consultation status

### POST `/api/consultations/[id]/comments`
- **Active consultations**: Allows comment creation and sends email notifications
- **Inactive consultations**: Returns 403 error with descriptive message
- **Server validation**: Double-checks consultation status before processing

## Database Schema

No database schema changes were required. The implementation uses existing fields:
- `isActive: Boolean`
- `endDate: DateTime`

## Backward Compatibility

- All new props have default values to maintain backward compatibility
- Existing functionality remains unchanged for active consultations
- Progressive enhancement approach ensures no breaking changes

## Testing Scenarios

To test the implementation:

1. **Active consultation** (isActive=true, endDate > now):
   - Should show "Ενεργή" badge
   - Should allow commenting
   - Should send email notifications

2. **Inactive by flag** (isActive=false, endDate > now):
   - Should show "Ανενεργή" badge
   - Should disable commenting
   - Should show expiry message

3. **Inactive by date** (isActive=true, endDate < now):
   - Should show "Ανενεργή" badge
   - Should disable commenting
   - Should show expiry message

4. **Inactive by both** (isActive=false, endDate < now):
   - Should show "Ανενεργή" badge
   - Should disable commenting
   - Should show expiry message

## Implementation Notes

- Used TypeScript interfaces and types for type safety
- Followed existing code patterns and naming conventions
- Maintained separation of concerns between UI and business logic
- Added comprehensive prop drilling to ensure status propagates correctly
- Implemented graceful error handling and user feedback