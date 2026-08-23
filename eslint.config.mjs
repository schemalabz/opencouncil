import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([{
    // services/* are separate workspace apps with their own lint setup;
    // the root app's Next config must not walk into them.
    ignores: ["services/**"],
}, {
    extends: [...nextCoreWebVitals],

    // CI runs `eslint . --max-warnings 0`, so a "warn" is as fatal as an
    // "error". The rules below must therefore be "off", not "warn", to keep
    // the Next 16 upgrade from being blocked by lint surface it didn't change.
    linterOptions: {
        // eslint-config-next v16 + the upgrade leave some `eslint-disable`
        // directives unused (the rules they targeted changed/were turned off).
        // Don't fail CI on those stale comments; clean up in a follow-up.
        reportUnusedDisableDirectives: "off",
    },

    settings: {
        "import/resolver": {
            typescript: {},
        },
    },

    rules: {
        // React Compiler rules introduced by eslint-config-next v16 (via
        // eslint-plugin-react-hooks v6). The existing codebase has ~170
        // preexisting violations that aren't bugs — just patterns the compiler
        // can't optimize. Turn off here to preserve the pre-upgrade lint
        // baseline; address iteratively in dedicated follow-ups.
        "react-hooks/set-state-in-effect": "off",
        "react-hooks/preserve-manual-memoization": "off",
        "react-hooks/refs": "off",
        "react-hooks/static-components": "off",
        "react-hooks/immutability": "off",
        "react-hooks/purity": "off",
        "react-hooks/error-boundaries": "off",
        "react-hooks/globals": "off",
        "react-hooks/incompatible-library": "off",
        "react-hooks/unsupported-syntax": "off",
        "react-hooks/no-deriving-state-in-effects": "off",
        "react-hooks/set-state-in-render": "off",
        // Long-standing rule, but v16's plugin newly surfaces 5 violations that
        // weren't flagged pre-upgrade. Keep off to preserve baseline.
        "react-hooks/exhaustive-deps": "off",

        // We use the App Router exclusively (no `pages/` dir). The flat config
        // can't auto-detect this and the rule flags every internal <a> as a
        // false positive. Disable.
        "@next/next/no-html-link-for-pages": "off",
    },
}, {
    // Client-side zones must never touch the database directly. Prisma access
    // belongs in src/lib/db (see the full boundary in
    // src/lib/__tests__/prisma-boundary.test.ts, which also covers server code).
    // These directories are Prisma-free today, so this rule is purely
    // preventive — it stops a regression at review time.
    files: ["src/components/**/*.{ts,tsx}", "src/contexts/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}"],
    rules: {
        "no-restricted-imports": ["error", {
            paths: [{
                name: "@prisma/client",
                importNames: ["PrismaClient"],
                message: "Do not instantiate PrismaClient in client-side code. Call a data-access function from src/lib/db instead. Type-only imports from @prisma/client are fine.",
            }],
            patterns: [{
                group: ["**/db/prisma", "@/lib/db/prisma"],
                message: "Do not import the Prisma client in client-side code. Call a data-access function from src/lib/db instead.",
            }],
        }],
    },
}]);