> [!NOTE]
> **Note for Contributors**: Before you begin, please read our [CONTRIBUTING.md](CONTRIBUTING.md) guide to understand our development workflow and co-creation process. We look forward to your contribution!

# PRD: Complete Localization Infrastructure

**Status:** Draft
**Related Issue:** #[issue_number] <!-- Please link to the relevant GitHub Issue -->

## 1. Background

The goal of this task is to complete the localization infrastructure to properly support both Greek (`el`) and English (`en`) throughout the entire application. Currently, the app uses `next-intl` for internationalization, but implementation is incomplete. There is a significant gap in translation key coverage between the Greek and English message files. Furthermore, translation files are split across `messages/` and `src/messages/`, and many UI components contain hardcoded, untranslated strings.

This initiative will address these gaps by consolidating translation files, performing a full audit to identify and replace hardcoded text with translation keys, and establishing parity between the `en.json` and `el.json` files.

## 2. Goals

- Consolidate all translation strings into single `en.json` and `el.json` files in the root `messages/` directory.
- Achieve 100% translation key parity between `messages/en.json` and `messages/el.json`.
- Eliminate all hardcoded user-facing strings from the codebase, replacing them with the `useTranslations` hook.
- Ensure a consistent and fully translated user experience for both English and Greek locales.

## 3. Technical Plan

### 3.1. Relevant Files & Directories

Based on an initial analysis, the following files and directories will be impacted:

-   **Translation Files**:
    -   `messages/en.json` (Target for consolidation)
    -   `messages/el.json`
    -   `src/messages/en.json` (To be merged and deleted)
-   **i18n Configuration**:
    -   `src/i18n/routing.ts`
    -   `src/middleware.ts` (Handles locale detection and redirection)
-   **UI Components**:
    -   `src/app/**/*.tsx`
    -   `src/components/**/*.tsx`

### 3.2. Implementation Steps

#### Step 1: Consolidate Translation Files

1.  Merge the contents of `src/messages/en.json` into the root `messages/en.json`.
2.  Delete the now-redundant `src/messages/en.json` file and the `src/messages` directory.

#### Step 2: Audit and Replace Hardcoded Strings

This is the core of the work. We will systematically scan all `.tsx` files for user-facing text that is not using the `useTranslations` hook.

**Key Naming Convention:**
We will use meaningful, nested keys to provide context and improve maintainability.

- **Good:** `UserProfile.form.saveButtonLabel`
- **Bad:** `save_changes`

**Example of a simple hardcoded string:**

```tsx
// Before: src/components/some-component.tsx
<button>Save Changes</button>
```

**Proposed Refactoring:**

1.  Add a corresponding key-value pair to both `messages/en.json` and `messages/el.json`.

    ```json
    // messages/en.json
    {
      "UserProfile": {
        "form": {
          "saveButtonLabel": "Save Changes"
        }
      }
    }
    ```

2.  Replace the hardcoded string in the component using the `useTranslations` hook.

    ```tsx
    // After: src/components/some-component.tsx
    import { useTranslations } from 'next-intl';

    export function SomeComponent() {
      const t = useTranslations('UserProfile.form');

      return <button>{t('saveButtonLabel')}</button>;
    }
    ```

**Example of a parameterized translation:**

Some translations will require dynamic values. `next-intl` supports this by passing an object of values.

```tsx
// Before: src/components/welcome-banner.tsx
<h1>Welcome, {userName}!</h1>
```

**Proposed Refactoring:**

1.  Add a key with a placeholder to the message files.

    ```json
    // messages/en.json
    {
      "WelcomeBanner": {
        "greeting": "Welcome, {userName}!"
      }
    }
    ```

2.  Pass the dynamic values to the translation function.

    ```tsx
    // After: src/components/welcome-banner.tsx
    import { useTranslations } from 'next-intl';

    export function WelcomeBanner({ userName }: { userName: string }) {
      const t = useTranslations('WelcomeBanner');

      return <h1>{t('greeting', { userName })}</h1>;
    }
    ```

#### Step 3: Achieve Translation Parity

As the audit proceeds, we must ensure every key added to `en.json` is also added to `el.json`, and vice versa. This may require collaboration with a Greek-speaking contributor or using translation tools as a starting point.

## 4. Success Metrics

-   The `src/messages/` directory is removed.
-   A search for common hardcoded words (e.g., "Loading...", "Save", "Error") in `.tsx` files yields no results in user-facing UI elements.
-   `messages/en.json` and `messages/el.json` contain an identical set of keys.
-   The application is fully usable and grammatically correct in both English and Greek, with no mixed-language text visible in the UI.

## 5. Open Questions

-   What is our strategy for translating strings that require context we don't immediately have?

## 6. Future Considerations

To prevent future hardcoded strings, we could consider adding a linting rule or other static analysis tool to our development process in a future task. This could involve:
- An ESLint plugin that flags hardcoded strings in JSX.
- A script that compares `en.json` and `el.json` for missing keys and runs as a pre-commit hook. 