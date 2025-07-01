# Admin Delete Comments Implementation

## Overview
This implementation allows administrators (super admins and city admins) to delete comments of other users in consultation comments, while preserving the ability for users to delete their own comments.

## Changes Made

### 1. Backend Changes

#### `src/lib/db/consultations.ts`

**Updated Type Definition:**
- Added `canUserDelete?: boolean` to the `ConsultationCommentWithUpvotes` interface to indicate if the current user can delete the comment.

**Enhanced `deleteConsultationComment` function:**
- Updated authorization logic to allow deletion by:
  - Comment author (existing functionality)
  - Super admins (`user.isSuperAdmin === true`)
  - City admins for the consultation's city (`user.administers` includes the cityId)
- Added proper user and admin information fetching
- Enhanced error handling

**Enhanced comment retrieval functions:**
- Updated `getConsultationComments()` to include `canUserDelete` flag
- Updated `getCommentsForEntity()` to include `canUserDelete` flag
- Both functions now check current user's admin status and set the flag appropriately

### 2. Frontend Changes

#### `src/components/consultations/CommentSection.tsx`

**Updated Delete Button Logic:**
- Changed condition from `session?.user?.id === comment.userId` to `(session?.user?.id === comment.userId || comment.canUserDelete)`
- Added different tooltip text for admin deletions: "Διαγραφή σχολίου (ως διαχειριστής)"
- Updated new comment creation to set `canUserDelete: true` for user's own comments

### 3. API Route Updates

#### `src/app/api/consultations/comments/[commentId]/delete/route.ts`

**Enhanced Error Handling:**
- Added handling for "User not found" error with 404 status code
- Existing authorization and comment not found errors remain unchanged

## Admin Permission Structure

The system uses the existing admin structure:

1. **Super Admins** (`user.isSuperAdmin = true`): Can delete any comment
2. **City Admins** (`user.administers` includes cityId): Can delete comments within their administered cities
3. **Comment Authors**: Can delete their own comments (existing functionality)

## User Experience

- **Regular Users**: See delete button only on their own comments
- **Admins**: See delete button on all comments they can manage
- **Visual Indicators**: Different tooltip text indicates when deletion is done as an administrator
- **Confirmation**: Standard confirmation dialog before deletion
- **Error Handling**: Appropriate error messages for unauthorized actions

## Security Considerations

- Authorization is enforced at both frontend (UI visibility) and backend (API) levels
- Double-check of permissions in the delete API route
- Proper error messages without revealing sensitive information
- Maintains audit trail through existing database constraints

## Testing Recommendations

1. Test super admin can delete any comment
2. Test city admin can delete comments only in their city
3. Test regular users can only delete their own comments
4. Test error handling for unauthorized delete attempts
5. Test UI visibility of delete buttons for different user types

## Files Modified

1. `src/lib/db/consultations.ts` - Backend logic and type definitions
2. `src/components/consultations/CommentSection.tsx` - Frontend UI and logic  
3. `src/app/api/consultations/comments/[commentId]/delete/route.ts` - API error handling

## Backward Compatibility

All existing functionality is preserved:
- Users can still delete their own comments
- Existing API contracts are maintained
- No breaking changes to the database schema
- Additional functionality is additive only