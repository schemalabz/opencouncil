# OpenCouncil Styling Guidelines

## Brand Identity

### Motion and Animation
- Use `framer-motion` for smooth, professional animations
- Common animation patterns:
  - Stagger children: 0.2s delay between items
  - Fade in with y-offset: `opacity: 0, y: 20` to `opacity: 1, y: 0`
  - Scroll-based opacity transitions using `useTransform`
  - Spring animations for natural movement

### Background Elements
- `FloatingPathsBackground` component for dynamic, subtle motion
- Background opacity transforms on scroll for depth
- Use blur effects (`blur-2xl`) for glow effects behind highlighted text
- Grid patterns and particles for visual texture

## Colors

### Primary Colors
- Use the `primary` class for main actions and important UI elements
- Party colors are used for visual identification (stored in `colorHex` property)
- Use opacity variants (e.g., `bg-primary/5`) for hover states
- Glow effects: `bg-primary/20` with blur for emphasis

### Text Colors
- Default text: System default (dark/light mode compatible)
- Muted text: Use `text-muted-foreground` for secondary information
- Party-specific text: Use the party's `colorHex` directly
- Gradient text available through `AnimatedGradientText` component

## Typography

### Text Sizes
- Hero text: `text-4xl sm:text-5xl md:text-7xl` with `tracking-tight`
- Headings:
  - H1: `text-3xl sm:text-4xl md:text-6xl` with `font-bold`
  - H2: `text-xl sm:text-2xl`
  - Body: `text-base` or `text-lg`
  - Small text: `text-sm`
  - Extra small: `text-xs`

### Font Weights
- Headers: `font-bold` for emphasis, `font-normal` for hero sections
- Regular text: System default
- Emphasis: `font-light` for contrast
- Italics: Used for emphasis in hero sections

## Layout

### Spacing
- Hero sections: `min-h-[85vh]` with `pt-24 sm:pt-32`
- Container: Use `container mx-auto`
- Padding:
  - Sections: `py-8 sm:py-16`
  - Cards: `p-4 sm:p-6`
  - Container edges: `px-2 sm:px-4`
- Gaps between items: `space-y-4 sm:space-y-6`
- Center alignment: `text-center` for hero sections

### Responsive Design
- Mobile-first approach using Tailwind breakpoints
- Common patterns:
  - `sm:` (640px+)
  - `md:` (768px+)
  - Text sizes increase at breakpoints
  - Padding/margins increase at breakpoints

## Components

### Cards
- Base: `Card` component from UI library
- Feature cards: Include icon, title, description, and optional badge
- Use `ShineBorder` for interactive card effects

### Interactive Elements
- Buttons: Use `Button` component from UI library
- Links: Use `Link` component from i18n routing
- Icons: Import from `lucide-react`
- Forms: Use form components with appropriate validation

### Social Elements
- Profile cards with image and social links
- Social icons from `lucide-react`
- Contact information with appropriate icons

## Accessibility
- Maintain proper contrast ratios
- Use semantic HTML elements
- Ensure interactive elements are keyboard accessible
- Support dark/light mode through system defaults