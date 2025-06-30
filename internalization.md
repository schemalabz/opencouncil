# OpenCouncil Internationalization (i18n) Guide

This document outlines the architecture and guidelines for internationalization within the OpenCouncil project. It serves as a reference for both human and AI contributors to ensure a consistent and scalable approach to localization. This guide is a living document and should be updated as our i18n strategy evolves. It follows the same co-creation principles outlined in [CONTRIBUTING.md](./CONTRIBUTING.md).

## 1. Guiding Principles

Our internationalization strategy is built on these core principles:

-   **Scalability**: The system must handle a growing number of languages and translation strings without becoming unmanageable.
-   **Maintainability**: Finding, updating, and removing translations should be straightforward and low-risk.
-   **Developer Experience**: Contributors should have a clear, simple process for adding and using translations.
-   **Performance**: We will only load the translations necessary for the current view, minimizing the initial bundle size and improving load times.

## 2. Architecture: File-Based Namespacing

To adhere to our principles, we are moving away from monolithic JSON files for each language. Instead, we use a **file-based namespacing** approach. All translation files are located in the `/messages` directory at the project root.

The structure is as follows:

```
/messages
  /{locale}/
    {namespace}.json
```

-   `{locale}`: The language code (e.g., `en`, `el`).
-   `{namespace}`: A logical grouping of translations related to a specific feature, page, or domain of the application.

### Why Namespacing?

This architecture offers several advantages:

1.  **Reduced Load**: `next-intl` can load namespaces on demand. This means a user visiting the Meetings page will only download the `meetings.json` and `common.json` files, not the entire translation catalog for the whole application.
2.  **Fewer Merge Conflicts**: Smaller, feature-focused files dramatically reduce the likelihood of merge conflicts when multiple contributors are working on different parts of the app.
3.  **Improved Organization**: It's immediately clear where to find a translation key. If you're working on the user profile, you look in `profile.json`.

## 3. Namespace Definitions

The following namespaces form the foundation of our i18n architecture. When adding a new translation, find the most appropriate namespace from this list.

| Namespace          | Description                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `admin.json`       | Contains all translations for the admin dashboard, including user management, tasks, and system settings.                                |
| `common.json`      | Shared, generic translations used across the entire application. Examples: "Save", "Cancel", "Loading...", "Error", date/time formats.   |
| `forms.json`       | Labels, placeholders, validation messages, and other texts related to forms throughout the app.                                          |
| `landing.json`     | All content for the main, unauthenticated landing page.                                                                                  |
| `meetings.json`    | Translations for the meeting details page, meeting lists, subjects, transcripts, highlights, and related components.                     |
| `pages.json`       | Content for static pages like "About Us", "Privacy Policy", and "Terms of Service".                                                      |
| `people.json`      | All text related to public figures (persons), including their profiles, lists, and related components.                                   |
| `parties.json`     | Translations for political party profiles, lists, and related components.                                                                |
| `profile.json`     | Content for the user profile page, including settings, preferences, and notification settings.                                           |
| `search.json`      | Translations for the search interface, filters, search results, and empty states.                                                        |
| `notifications.json` | Text for user-facing notifications (e.g., toast messages, alerts) that are not part of a specific form's validation.              |
| `chat.json`        | All text for the chat interface.                                                                                                         |

## 4. Usage in Code

To use translations in your components, import the `useTranslations` hook from `next-intl`.

```tsx
// Example in a Client Component
import { useTranslations } from 'next-intl';

export default function MeetingDetails() {
  const t = useTranslations('meetings'); // Loads the 'meetings' namespace

  return <h1>{t('details.title')}</h1>;
}
```

On the server (e.g., in Server Components or API routes), use `getTranslator`.

```tsx
// Example in a Server Component
import { getTranslator } from 'next-intl/server';

export async function generateMetadata({ params: { locale } }) {
  const t = await getTranslator(locale, 'meetings');

  return {
    title: t('meta.title'),
  };
}
```

## 5. Contributing New Translations

When adding or updating text that will be visible to users, follow this workflow. This applies to both human and AI contributors.

1.  **Identify the Namespace**: Determine which namespace the new translation belongs to based on the **Namespace Definitions** table above.
2.  **Choose a Key**: Create a descriptive, hierarchical key. For example, for a button that saves meeting highlights, a good key would be `meetings.highlights.saveButton`.
3.  **Add the Key**: Add the new key and its translated string to the appropriate files for **all supported languages** (e.g., `messages/en/{namespace}.json` and `messages/el/{namespace}.json`).
4.  **Implement**: Use the `useTranslations('{namespace}')` hook in your component to access and render the string.

> [!IMPORTANT]
> If you believe a new namespace is required, please initiate a discussion by creating a GitHub Issue to ensure the overall architecture remains clean and consistent. 