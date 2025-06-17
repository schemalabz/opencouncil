# User Onboarding System

(see `db/schema.prisma` for data models: `NotificationPreference`, `Petition`, `User`, `City`, `Location`, `Topic`)

OpenCouncil allows users to sign up for notifications about city council topics relevant to their neighborhoods and interests. The system handles two flows: notification signup for supported cities, and petition collection for unsupported cities.

## Entry Points

**Landing page**: [`src/app/[locale]/(other)/page.tsx`](/src/app/[locale]/(other)/page.tsx) includes a [`MunicipalitySelector`](/src/components/onboarding/selectors/MunicipalitySelector.tsx) component that routes users to:
- `/${cityId}` for cities with `isListed = true` (main city page)
- `/${cityId}/petition` for cities with `isListed = false` (petition flow)

**City main page**: For listed cities, if `supportsNotifications = true`, shows a notification signup/management button that routes to `/${cityId}/notifications`

## Business Rules

- Users can have multiple notification preferences for different cities, but **only one per city**
- Users can have multiple petitions for different cities, but **only one per city**
- Existing users see their current preferences and can update them
- Notification signup is only available for listed cities (`isListed = true`) that support notifications (`supportsNotifications = true`)
- Non-listed cities (`isListed = false`) only show petition flow, regardless of notification support

## Implementation

**Core files**:
- [`src/components/onboarding/OnboardingPageContent.tsx`](/src/components/onboarding/OnboardingPageContent.tsx) - Root container with full-screen layout
- [`src/contexts/OnboardingContext.tsx`](/src/contexts/OnboardingContext.tsx) - State management for both flows
- [`src/lib/types/onboarding.ts`](/src/lib/types/onboarding.ts) - Type-safe flow definitions and stage management

**Architecture**:
- [`FormContainer`](/src/components/onboarding/containers/FormContainer.tsx) + [`MapContainer`](/src/components/onboarding/containers/MapContainer.tsx) split-screen design
- Context-driven state management across all components
- Type-safe stage transitions defined in [`src/lib/types/onboarding.ts`](/src/lib/types/onboarding.ts)

## Notification Flow
1. **Info** (`NOTIFICATION_INFO`) - Introduction, shows existing preferences if any
2. **Location** (`NOTIFICATION_LOCATION_SELECTION`) - Google Places autocomplete, map visualization
3. **Topic** (`NOTIFICATION_TOPIC_SELECTION`) - Topic selection from database
4. **Registration** (`NOTIFICATION_REGISTRATION`) - User info + review, creates `NotificationPreference`
5. **Complete** - Success message

## Petition Flow  
1. **Info** (`PETITION_INFO`) - Explains city not in network, shows existing petition if any
2. **Form** (`PETITION_FORM`) - Name + citizen/resident checkboxes
3. **Registration** (`PETITION_REGISTRATION`) - User info + review, creates `Petition`  
4. **Complete** - Success message

## Key Components
- [`MunicipalitySelector`](/src/components/onboarding/selectors/MunicipalitySelector.tsx) - Searchable combobox with quick selection buttons
- [`LocationSelector`](/src/components/onboarding/selectors/LocationSelector.tsx) - Google Places integration with map markers
- [`TopicSelector`](/src/components/onboarding/selectors/TopicSelector.tsx) - Database topic selection with badges
- [`UserInfoForm`](/src/components/onboarding/UserInfoForm.tsx) - Email/phone collection with validation
- Step components in [`src/components/onboarding/steps/`](/src/components/onboarding/steps/)





