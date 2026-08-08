import type { Config } from "tailwindcss"
import preset from "./packages/ui/tailwind-preset"

// Theme (colors, keyframes, fonts, plugins) lives in the shared preset so the
// main app and services/* apps cannot drift apart. Only content globs and the
// app-specific safelist belong here.
const config = {
	presets: [preset],
	content: [
		'./pages/**/*.{ts,tsx}',
		'./components/**/*.{ts,tsx}',
		'./app/**/*.{ts,tsx}',
		'./src/**/*.{ts,tsx}',
		'./packages/ui/src/**/*.{ts,tsx}',
	],
	safelist: ['animate-flow', 'animate-arrow-pulse'],
} satisfies Config

export default config
