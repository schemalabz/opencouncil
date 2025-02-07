# OpenCouncil Styling Guidelines

## Colors

### Primary Colors
- Use the `primary` class for main actions and important UI elements
- Party colors are used for visual identification (stored in `colorHex` property)
- Use opacity variants (e.g., `bg-primary/5`) for hover states

### Text Colors
- Default text: System default (dark/light mode compatible)
- Muted text: Use `text-muted-foreground` for secondary information
- Party-specific text: Use the party's `colorHex` directly

## Typography

### Text Sizes
- Headings:
  - H1: `text-3xl sm:text-4xl md:text-6xl` with `font-bold`
  - H2: `text-xl sm:text-2xl`
  - Body: `text-base` or `text-lg`
  - Small text: `text-sm`
  - Extra small: `text-xs`

### Font Weights
- Headers: `font-bold`
- Regular text: System default
- Emphasis: `font-light` for contrast

## Layout

### Spacing
- Container: Use `container mx-auto`
- Padding:
  - Sections: `py-8 sm:py-16`
  - Cards: `p-4 sm:p-6`
  - Container edges: `px-2 sm:px-4`
- Gaps between items: `space-y-4 sm:space-y-6`

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
- Hover effects:
  ```css
  hover:shadow-lg hover:scale-[1.01]
  transition-all duration-300
  ```
- Border styling: Use left border for category/party indication
  ```css
  border-l-8 [borderLeftColor: party?.colorHex || 'gray']
  ```

### Buttons
- Primary: `Button` component with default variant
- Secondary: `Button` with `variant="outline"`
- Link style: `Button` with `variant="link"`
- Sizes:
  - Default: Regular padding
  - Large: `size="lg"` with `px-6 sm:px-8`
  - Small: `size="sm"`

### Badges
- Use for status indicators and tags
- PersonBadge component for consistent person display
- Sizes: `sm`, `md`, `lg`, `xl`

### Images
- Use `ImageOrInitials` component for profile pictures
- Circular format with party color background
- Responsive sizes based on context

## Animations

### Transitions
- Use `transition-all duration-300` for smooth state changes
- Hover effects should be subtle and enhance usability
- Loading states: Use `animate-spin` with `Loader2` component

### Interactive Elements
- Hover states: Use opacity changes (e.g., `hover:bg-accent/5`)
- Scale effects: Subtle transforms on hover (e.g., `hover:scale-[1.01]`)
- Cursor feedback: `cursor-pointer` for clickable elements

## Best Practices

1. **Responsive Design**
   - Always include mobile-first styles
   - Use Tailwind's responsive prefixes consistently
   - Test layouts at all breakpoints

2. **Dark Mode Compatibility**
   - Use semantic color classes (`primary`, `accent`, etc.)
   - Avoid hard-coded colors except for brand colors
   - Test in both light and dark modes

3. **Accessibility**
   - Maintain sufficient color contrast
   - Include hover/focus states for interactive elements
   - Use semantic HTML elements

4. **Performance**
   - Use Tailwind's JIT compilation
   - Keep transitions performant (transform, opacity)
   - Lazy load images where appropriate

5. **Code Organization**
   - Group related styles using Tailwind's group modifiers
   - Use consistent class ordering
   - Extract common patterns into reusable components