# User Onboarding & Authentication

(see `db/schema.prisma` for data models: `User`, `VerificationToken`, `Session`, `Account`, `NotificationPreference`, `Petition`)
(see `docs/user-management.prd.md` for admin-specific user management)

OpenCouncil supports several pathways for user authentication and account creation. This document provides a technical overview of these flows, from a citizen signing up for notifications to an administrator being invited to the platform.

## Authentication & Account Creation Flows

This section outlines the different ways a user can be created and authenticated.

### 1. Standard Magic Link Sign-In/Sign-Up

This is the primary, general-purpose authentication method. It handles both new user registration and sign-in for existing users seamlessly.

**User Journey:**
1. A user clicks a "Sign In" button on the site.
2. The user enters their email address.
3. A magic link is sent to their email.
4. Clicking the link authenticates the user and creates a session. If the user does not exist, an account is automatically created by NextAuth.

### 2. Onboarding-Integrated Sign-Up

This flow allows a new, unauthenticated user to sign up while submitting their notification preferences or a petition.

**User Journey:**
1. An unauthenticated user completes the notification or petition flow.
2. In the final "Registration" step, the user provides their email and optionally their name.
3. When the form is submitted, the backend API (`/api/notifications/preferences` or `/api/petitions`) is called.
4. The API first checks if a user with the provided email already exists. If not, a new user account is created using the email and name. If the user already exists, their information is retrieved.
5. The notification preferences or petition signature is then associated with the existing or newly created user account.
6. This process creates a user record in the database but does not automatically sign the user in. The user can later sign in using the standard magic link flow, which will give them access to manage their preferences or petitions.

### 3. Admin-Initiated User Creation & Invitation

Super Admins can create new administrative users directly from the `/admin` panel.

**User Journey:**
1. A Super Admin navigates to `/admin/users` and clicks "Create User".
2. They fill in the new user's email, name, and administrative rights.
3. Upon creation, an invitation email with a secure, token-based sign-in link is sent to the new user.

## Feature-Specific Onboarding Flows

These are the detailed user journeys for signing up for notifications or petitions.

### Entry Points

**Landing page**: [`src/app/[locale]/(other)/page.tsx`](/src/app/[locale]/(other)/page.tsx) includes a [`MunicipalitySelector`](/src/components/onboarding/selectors/MunicipalitySelector.tsx) component that routes users to:
- `/${cityId}` for cities with `isListed = true` (main city page)
- `/${cityId}/petition` for cities with `isListed = false` (petition flow)

**City main page**: For listed cities, if `supportsNotifications = true`, shows a notification signup/management button that routes to `/${cityId}/notifications`

### Business Rules

- Users can have multiple notification preferences for different cities, but **only one per city**.
- Users can have multiple petitions for different cities, but **only one per city**.
- Existing users see their current preferences and can update them.
- Notification signup is only available for listed cities (`isListed = true`) that support notifications (`supportsNotifications = true`).
- Non-listed cities (`isListed = false`) only show the petition flow.

### Implementation

**Core files**:
- [`src/components/onboarding/OnboardingPageContent.tsx`](/src/components/onboarding/OnboardingPageContent.tsx) - Root container with full-screen layout
- [`src/contexts/OnboardingContext.tsx`](/src/contexts/OnboardingContext.tsx) - State management for both flows
- [`src/lib/types/onboarding.ts`](/src/lib/types/onboarding.ts) - Type-safe flow definitions and stage management

**Architecture**:
- [`FormContainer`](/src/components/onboarding/containers/FormContainer.tsx) + [`MapContainer`](/src/components/onboarding/containers/MapContainer.tsx) split-screen design
- Context-driven state management across all components
- Type-safe stage transitions defined in [`src/lib/types/onboarding.ts`](/src/lib/types/onboarding.ts)

### Notification Flow
1. **Info** (`NOTIFICATION_INFO`) - Introduction, shows existing preferences if any
2. **Location** (`NOTIFICATION_LOCATION_SELECTION`) - Google Places autocomplete, map visualization
3. **Topic** (`NOTIFICATION_TOPIC_SELECTION`) - Topic selection from database
4. **Registration** (`NOTIFICATION_REGISTRATION`) - User info + review, creates `NotificationPreference`
5. **Complete** - Success message

### Petition Flow  
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





