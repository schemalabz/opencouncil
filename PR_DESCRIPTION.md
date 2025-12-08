# Simplify City Status Properties

## Summary

This PR simplifies the City model by combining `isPending` and `isListed` boolean properties into a single `status` enum field, reducing the number of properties from three booleans to one enum and one boolean (`officialSupport`), while maintaining all existing application behavior.

## Changes

### Database Schema
- **Added** `CityStatus` enum with values: `pending`, `unlisted`, `listed`
- **Replaced** `isPending` and `isListed` boolean fields with a single `status` field of type `CityStatus`
- **Updated** index from `@@index([isPending, isListed])` to `@@index([status])`
- **Preserved** `officialSupport` boolean field (unchanged)

### Migration
- Created migration to convert existing data:
  - `isPending: true` → `status: 'pending'`
  - `isPending: false, isListed: false` → `status: 'unlisted'`
  - `isPending: false, isListed: true` → `status: 'listed'`

### Code Updates
- **Database Functions** (`src/lib/db/cities.ts`): Updated all query functions to use `status` instead of `isPending`/`isListed`
- **API Routes**: Updated POST and PUT routes to accept and handle `status` enum
- **Components**: Updated all components that reference city status (CityForm, CityHeader, Landing, MunicipalitySelector, etc.)
- **Translations**: Updated English and Greek translation files with new status field labels
- **Tests**: Updated test files and factories to use the new `status` field
- **Seed Files**: Updated seed and import scripts

### UI Changes
- **CityForm**: Replaced two checkboxes (`isPending`, `isListed`) with a single status dropdown (`pending`, `unlisted`, `listed`)
- **Admin Settings**: Now shows:
  - Status dropdown: Pending / Unlisted / Listed
  - Official Support checkbox (unchanged)

## Behavior Preservation

All existing application behavior is maintained:

- **Pending cities** (`status: 'pending'`):
  - Route to petition page (`/${city.id}/petition`)
  - Excluded from public listings
  - Show "Import Data" button for superadmins
  - Excluded from public city queries by default

- **Unlisted cities** (`status: 'unlisted'`):
  - Only visible to administrators
  - Visible to users who can administer the city
  - Route to petition page when selected
  - Excluded from public city selectors

- **Listed cities** (`status: 'listed'`):
  - Publicly visible
  - Appear in public city selectors
  - Route to city page (`/${city.id}`)
  - Included in public queries

- **Official Support** (`officialSupport: boolean`):
  - Unchanged behavior
  - Affects prioritization in listings
  - Shows special badge in UI
  - Required for landing page display with meeting data

## Files Changed

### Schema & Migration
- `prisma/schema.prisma` - Added enum, replaced fields
- `prisma/migrations/20251208201529_combine_is_pending_is_listed_to_status/migration.sql` - Data migration

### Database & API
- `src/lib/db/cities.ts` - Updated query functions
- `src/app/api/cities/route.ts` - Updated POST handler
- `src/app/api/cities/[cityId]/route.ts` - Updated PUT handler
- `src/app/api/cities/[cityId]/reset/route.ts` - Updated reset logic
- `src/app/api/cities/[cityId]/populate/route.ts` - Updated populate logic
- `src/app/api/dev/seed-users/route.ts` - Updated seed logic
- `src/app/api/admin/elasticsearch/status/route.ts` - Updated status API

### Components
- `src/components/cities/CityForm.tsx` - Updated form to use status dropdown
- `src/components/cities/CityHeader.tsx` - Updated status checks
- `src/components/landing/landing.tsx` - Updated routing logic
- `src/app/[locale]/(other)/page.tsx` - Updated filtering logic
- `src/components/onboarding/selectors/PetitionMunicipalitySelector.tsx` - Updated routing
- `src/components/onboarding/selectors/MunicipalitySelector.tsx` - Updated filtering
- `src/components/admin/elasticsearch/Status.tsx` - Updated status display

### Utilities & Tests
- `src/lib/tasks/tasks.ts` - Updated task queries
- `src/lib/__tests__/landing.test.ts` - Updated test expectations
- `tests/helpers/factories.ts` - Updated factory defaults
- `prisma/seed.ts` - Updated seed data mapping
- `prisma/import_administrations.ts` - Updated import logic

### Translations
- `messages/en.json` - Added status field translations
- `messages/el.json` - Added status field translations

## Migration Notes

The migration automatically converts all existing data:
- Cities with `isPending: true` become `status: 'pending'`
- Cities with `isPending: false, isListed: false` become `status: 'unlisted'`
- Cities with `isPending: false, isListed: true` become `status: 'listed'`

No manual data migration is required.

## Testing

- [x] Migration successfully converts existing data
- [x] All database queries updated and tested
- [x] Form submission works with new status field
- [x] Routing logic preserves existing behavior
- [x] Public/private visibility logic unchanged
- [x] Admin functionality preserved
- [x] Tests updated and passing

## Benefits

1. **Simpler Model**: Two properties instead of three, reducing complexity
2. **Clearer Semantics**: Status enum makes the city's state more explicit
3. **Better UX**: Single dropdown is more intuitive than two checkboxes
4. **Type Safety**: Enum provides better type checking than boolean combinations
5. **Maintainability**: Easier to understand and modify city status logic
