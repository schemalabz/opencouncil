# Budget Comparison Component

## Overview

The Budget Comparison component provides an interactive, accessible way to compare municipal budget allocations across Greek municipalities. This prototype demonstrates the UI/UX vision for the full Municipal Budget and Technical Program Visualization Tool proposed for GSoC 2026.

## Features

- **Multi-Municipality Comparison**: Compare budget categories across multiple municipalities side-by-side
- **Per-Capita Normalization**: View spending in absolute terms or normalized per capita for fair comparison
- **Interactive Selection**: Easily add/remove municipalities from the comparison
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- **Bilingual Support**: Full Greek and English translations
- **Accessibility**: WCAG 2.1 AA compliant with proper ARIA labels and keyboard navigation

## Component Structure

```
src/
├── components/
│   └── budgets/
│       └── BudgetComparison.tsx      # Main component
├── types/
│   └── budget.ts                      # TypeScript type definitions
├── lib/
│   └── mock-data/
│       └── budgets.ts                 # Mock data generator
└── messages/
    ├── en.json                        # English translations
    └── el.json                        # Greek translations
```

## Usage

### Basic Usage

```tsx
import { BudgetComparison } from "@/components/budgets/BudgetComparison";

export default function BudgetPage() {
  return <BudgetComparison />;
}
```

### With Custom Options

```tsx
import { BudgetComparison } from "@/components/budgets/BudgetComparison";

export default function BudgetPage() {
  return (
    <BudgetComparison
      initialMunicipalities={["athens", "thessaloniki", "piraeus"]}
      year={2024}
      locale="el"
    />
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `initialMunicipalities` | `string[]` | `["athens", "thessaloniki"]` | Array of municipality IDs to display initially |
| `year` | `number` | `2024` | Budget year to display |
| `locale` | `"el" \| "en"` | `"el"` | Language for the interface |

## Data Structure

### Budget Categories

The component uses the Greek municipal accounting system (KAE codes):

- `60` - Personnel Costs (Αμοιβές και Έξοδα Προσωπικού)
- `62` - Third Party Services (Παροχές Τρίτων)
- `66` - Supply Procurement (Προμήθεια Αναλώσιμων)
- `73` - Public Works (Δημόσια Έργα)
- `65` - Other General Expenses (Λοιπά Γενικά Έξοδα)

### Mock Data

Currently uses realistic mock data based on:
- Real Greek municipal budget structures
- Actual population figures
- Typical spending distribution patterns

In the full implementation, this will be replaced with actual data extracted from PDF documents.

## Technical Details

### Charts

Built using [Recharts](https://recharts.org/) with OpenCouncil's custom `ChartContainer` wrapper for consistent theming and responsive behavior.

### Internationalization

Uses `next-intl` for translations. All user-facing strings are fully translatable through the `messages/` files.

### Styling

- **Tailwind CSS** for utility-first styling
- **Shadcn UI** components for consistent design
- **CSS Variables** for dynamic theming (light/dark mode support)

## Future Enhancements

For the full GSoC implementation:

1. **PDF Processing**: Replace mock data with real PDF extraction pipeline
2. **Time Series**: Add year-over-year trend analysis
3. **Export**: Allow users to export comparisons as CSV/PDF
4. **Search**: Full-text search across budget line items
5. **Drill-Down**: Expand categories to show detailed subcategories
6. **Map Integration**: Geographic visualization of technical program projects
7. **Advanced Filters**: Filter by category, amount range, growth rate
8. **Data Quality Indicators**: Show confidence scores for extracted data

## Development

### Testing the Component

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Navigate to the demo page (see example below)

3. Interact with the component:
   - Toggle between absolute and per-capita views
   - Click municipality badges to add/remove from comparison
   - Hover over chart bars for detailed tooltips

### Creating a Demo Page

Create `src/app/[locale]/demo/budgets/page.tsx`:

```tsx
import { BudgetComparison } from "@/components/budgets/BudgetComparison";

export default function BudgetDemoPage() {
  return (
    <div className="container py-8">
      <BudgetComparison />
    </div>
  );
}
```

## Contributing

This prototype is part of the GSoC 2026 proposal for the Municipal Budget and Technical Program Visualization Tool. Feedback and suggestions are welcome!

### Related Issues

- [#176 - Budget and Technical Programs Extraction Tool](https://github.com/schemalabz/opencouncil/issues/176)

## License

This component is part of OpenCouncil and follows the same license terms.

## Contact

For questions or feedback:
- **Project**: [OpenCouncil](https://opencouncil.gr)
- **Mentors**: Andreas Kouloumos (andreas@opencouncil.gr), Christos Porios (christos@opencouncil.gr)
