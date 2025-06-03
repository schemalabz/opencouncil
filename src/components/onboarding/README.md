# Onboarding Flow Components

This directory contains the components that power OpenCouncil's user onboarding experience. The onboarding flow is designed to handle two distinct user journeys:

1. **Notification Signup**: For users in municipalities that support OpenCouncil
2. **Petition Flow**: For users in municipalities that don't yet support OpenCouncil

## Architectural Overview

The onboarding system is built around a few key architectural decisions:

### 1. Context-First Design
- `OnboardingContext` serves as the single source of truth
- Manages all state transitions and data flow
- Handles both notification and petition flows
- Provides a unified API for all components

### 2. Page-Level Container Pattern
- `OnboardingPageContent` acts as the root container
- Manages the high-level layout (map + form)
- Handles initial data loading and error states
- Provides a clean separation between page and flow logic

### 3. Split Container Architecture
- `FormContainer`: Manages the form-based interaction flow
- `MapContainer`: Handles map visualization and interaction
- Both containers operate independently but share state through context
- Enables responsive design and better performance



## Directory Structure

```
src/components/onboarding/
├── steps/
│   ├── notification/
│   │   ├── NotificationInfoStep.tsx         # Step 1: Introduction to notifications
│   │   ├── NotificationLocationStep.tsx     # Step 2: Location selection
│   │   ├── NotificationTopicStep.tsx        # Step 3: Topic selection
│   │   └── NotificationRegistrationStep.tsx # Step 4: User registration
│   ├── petition/
│   │   ├── PetitionInfoStep.tsx             # Step 1: Initial petition info
│   │   ├── PetitionFormStep.tsx             # Step 2: Detailed petition form
│   │   └── PetitionRegistrationStep.tsx     # Step 3: User registration
│   └── CompleteStep.tsx                     # Final success step
├── selectors/
│   ├── LocationSelector.tsx                # Reusable location selector
│   ├── TopicSelector.tsx                   # Reusable topic selector
│   └── MunicipalitySelector.tsx            # Reusable municipality selector
├── containers/
│   ├── FormContainer.tsx                   # Form container with step navigation
│   └── MapContainer.tsx                    # Map container for location visualization
├── OnboardingStepTemplate.tsx              # Common step layout
├── OnboardingFooter.tsx                    # Common step footer
├── UserInfoForm.tsx                        # Reusable user info form
├── PreferencesOverview.tsx                 # Reusable component for displaying preferences
└── SignupPageContent.tsx                   # Main container component
```

## Flow Overview

### Notification Signup Flow
1. **Introduction**: Users learn about personalized notifications
2. **Location Selection**: Users select specific locations within their municipality
3. **Topic Selection**: Users choose topics of interest
4. **Registration**: Users provide contact information and review selections
5. **Complete**: Success message and navigation options

### Petition Flow
1. **Petition Info**: Users provide initial petition information
2. **Petition Form**: Users fill out detailed petition information
3. **Registration**: Users provide contact information and review petition
4. **Complete**: Success message and navigation options

The flow is managed through a type-safe system defined in `src/lib/types/onboarding.ts`:

## Usage Examples

### Adding a New Step
1. Add new stage to `OnboardingStage` enum
2. Update flow configuration in `onboarding.ts`
3. Create step component
4. Add to `FormContainer` render logic
5. Implement proper validation and error handling

### Modifying Flow
1. Update flow configuration in `onboarding.ts`
2. Adjust stage transitions
3. Update step components as needed
4. Test all flow paths
5. Ensure responsive design
6. Update documentation

### Implementing New Features
1. Follow the established component structure
2. Use existing reusable components when possible
3. Implement proper type safety
4. Add appropriate error handling
5. Update documentation
6. Add tests for new functionality

### Handling Loading States
1. Use the context's loading state system
2. Show loading spinner during initial data fetch
3. Prevent content flashing
4. Handle error states gracefully
5. Maintain context availability during loading
6. Provide user-friendly error messages 