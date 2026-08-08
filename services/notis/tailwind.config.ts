import type { Config } from "tailwindcss";
import preset from "../../packages/ui/tailwind-preset";

const config = {
  presets: [preset],
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
} satisfies Config;

export default config;
