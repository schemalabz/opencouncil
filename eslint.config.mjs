import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig([{
    extends: [...nextCoreWebVitals],

    settings: {
        "import/resolver": {
            typescript: {},
        },
    },

    rules: {
        // New React Compiler rules introduced by eslint-config-next v16. The
        // existing codebase has hundreds of preexisting violations that aren't
        // bugs — just patterns the compiler can't optimize. Downgrade to warn
        // so the upgrade doesn't change the lint baseline; address in follow-ups.
        "react-hooks/set-state-in-effect": "warn",
        "react-hooks/preserve-manual-memoization": "warn",
        "react-hooks/refs": "warn",
        "react-hooks/static-components": "warn",
        "react-hooks/immutability": "warn",
        "react-hooks/purity": "warn",
        "react-hooks/error-boundaries": "warn",
        "react-hooks/globals": "warn",
        "react-hooks/incompatible-library": "warn",
        "react-hooks/unsupported-syntax": "warn",
        "react-hooks/no-deriving-state-in-effects": "warn",
        "react-hooks/set-state-in-render": "warn",

        // We use the App Router exclusively (no `pages/` dir). The flat config
        // can't auto-detect this and the rule flags every internal <a> as a
        // false positive. Disable.
        "@next/next/no-html-link-for-pages": "off",
    },
}]);