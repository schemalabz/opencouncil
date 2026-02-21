/**
 * Mock data for budget visualization prototypes
 * Based on real Greek municipal budget structures
 */

import { MunicipalBudget, BudgetCategory, BudgetComparison } from "@/types/budget";

/**
 * Greek municipal budget categories (simplified structure)
 * Based on the KAE (Κωδικός Αριθμός Εξόδων) system
 */
const BUDGET_CATEGORIES = {
  // Revenue categories
  REVENUE: {
    code: "0",
    name: "Έσοδα",
    name_en: "Revenue",
    subcategories: [
      { code: "00", name: "Τακτικά Έσοδα", name_en: "Regular Revenue" },
      { code: "01", name: "Φόροι - Τέλη", name_en: "Taxes - Fees" },
      { code: "02", name: "Ενοίκια", name_en: "Rents" },
      { code: "03", name: "Επιχορηγήσεις", name_en: "Grants" },
    ],
  },
  // Expenditure categories
  EXPENDITURE: {
    code: "6",
    name: "Έξοδα",
    name_en: "Expenditure",
    subcategories: [
      { code: "60", name: "Αμοιβές Προσωπικού", name_en: "Personnel Costs" },
      { code: "61", name: "Αμοιβές Αιρετών", name_en: "Elected Officials' Salaries" },
      { code: "62", name: "Παροχές Τρίτων", name_en: "Third Party Services" },
      { code: "64", name: "Φόροι - Τέλη", name_en: "Taxes - Fees" },
      { code: "65", name: "Λοιπά Γενικά Έξοδα", name_en: "Other General Expenses" },
      { code: "66", name: "Δαπάνες Προμήθειας Αναλώσιμων", name_en: "Supply Procurement" },
    ],
  },
  INVESTMENTS: {
    code: "7",
    name: "Επενδύσεις",
    name_en: "Investments",
    subcategories: [
      { code: "71", name: "Αγορές Ακινήτων", name_en: "Real Estate Purchases" },
      { code: "73", name: "Έργα", name_en: "Public Works" },
      { code: "74", name: "Μελέτες - Εφαρμογές", name_en: "Studies - Applications" },
    ],
  },
};

/**
 * Generate realistic budget categories with amounts
 */
function generateBudgetCategories(
  baseAmount: number,
  variance: number = 0.2
): BudgetCategory[] {
  const categories: BudgetCategory[] = [];

  // Personnel costs (largest category)
  const personnelAmount = baseAmount * 0.45 * (1 + (Math.random() * variance - variance / 2));
  categories.push({
    id: "cat-personnel",
    code: "60",
    name: "Αμοιβές και Έξοδα Προσωπικού",
    name_en: "Personnel Costs",
    amount: personnelAmount,
  });

  // Third party services
  const servicesAmount = baseAmount * 0.2 * (1 + (Math.random() * variance - variance / 2));
  categories.push({
    id: "cat-services",
    code: "62",
    name: "Παροχές Τρίτων",
    name_en: "Third Party Services",
    amount: servicesAmount,
  });

  // Public works and investments
  const worksAmount = baseAmount * 0.15 * (1 + (Math.random() * variance - variance / 2));
  categories.push({
    id: "cat-works",
    code: "73",
    name: "Δημόσια Έργα",
    name_en: "Public Works",
    amount: worksAmount,
  });

  // Supply procurement
  const suppliesAmount = baseAmount * 0.1 * (1 + (Math.random() * variance - variance / 2));
  categories.push({
    id: "cat-supplies",
    code: "66",
    name: "Προμήθεια Αναλώσιμων",
    name_en: "Supply Procurement",
    amount: suppliesAmount,
  });

  // Other expenses
  const otherAmount = baseAmount * 0.1 * (1 + (Math.random() * variance - variance / 2));
  categories.push({
    id: "cat-other",
    code: "65",
    name: "Λοιπά Γενικά Έξοδα",
    name_en: "Other General Expenses",
    amount: otherAmount,
  });

  return categories;
}

/**
 * Mock municipal budgets for major Greek cities
 */
export const MOCK_BUDGETS: MunicipalBudget[] = [
  {
    id: "budget-athens-2024",
    municipalityId: "athens",
    municipalityName: "Δήμος Αθηναίων",
    municipalityName_en: "Municipality of Athens",
    year: 2024,
    type: "initial",
    totalRevenue: 458_000_000,
    totalExpenditure: 450_000_000,
    categories: generateBudgetCategories(450_000_000),
    uploadDate: new Date("2024-01-15"),
  },
  {
    id: "budget-thessaloniki-2024",
    municipalityId: "thessaloniki",
    municipalityName: "Δήμος Θεσσαλονίκης",
    municipalityName_en: "Municipality of Thessaloniki",
    year: 2024,
    type: "initial",
    totalRevenue: 248_000_000,
    totalExpenditure: 245_000_000,
    categories: generateBudgetCategories(245_000_000),
    uploadDate: new Date("2024-01-20"),
  },
  {
    id: "budget-piraeus-2024",
    municipalityId: "piraeus",
    municipalityName: "Δήμος Πειραιά",
    municipalityName_en: "Municipality of Piraeus",
    year: 2024,
    type: "initial",
    totalRevenue: 185_000_000,
    totalExpenditure: 182_000_000,
    categories: generateBudgetCategories(182_000_000),
    uploadDate: new Date("2024-01-18"),
  },
  {
    id: "budget-patras-2024",
    municipalityId: "patras",
    municipalityName: "Δήμος Πατρέων",
    municipalityName_en: "Municipality of Patras",
    year: 2024,
    type: "initial",
    totalRevenue: 125_000_000,
    totalExpenditure: 123_000_000,
    categories: generateBudgetCategories(123_000_000),
    uploadDate: new Date("2024-01-22"),
  },
  {
    id: "budget-heraklion-2024",
    municipalityId: "heraklion",
    municipalityName: "Δήμος Ηρακλείου",
    municipalityName_en: "Municipality of Heraklion",
    year: 2024,
    type: "initial",
    totalRevenue: 110_000_000,
    totalExpenditure: 108_000_000,
    categories: generateBudgetCategories(108_000_000),
    uploadDate: new Date("2024-01-25"),
  },
];

/**
 * Generate comparison data structure for visualizations
 */
export function generateBudgetComparison(
  municipalityIds: string[],
  year: number = 2024
): BudgetComparison {
  const selectedBudgets = MOCK_BUDGETS.filter(
    (b) => municipalityIds.includes(b.municipalityId) && b.year === year
  );

  if (selectedBudgets.length === 0) {
    throw new Error("No budgets found for the specified municipalities and year");
  }

  // Extract unique categories
  const categoryMap = new Map<string, { name: string; name_en: string; amounts: Record<string, number> }>();

  selectedBudgets.forEach((budget) => {
    budget.categories.forEach((cat) => {
      const existing = categoryMap.get(cat.code);
      if (existing) {
        existing.amounts[budget.municipalityId] = cat.amount;
      } else {
        categoryMap.set(cat.code, {
          name: cat.name,
          name_en: cat.name_en,
          amounts: { [budget.municipalityId]: cat.amount },
        });
      }
    });
  });

  return {
    municipalities: selectedBudgets.map((b) => ({
      id: b.municipalityId,
      name: b.municipalityName,
      name_en: b.municipalityName_en,
    })),
    year,
    categories: Array.from(categoryMap.entries()).map(([code, data]) => ({
      code,
      name: data.name,
      name_en: data.name_en,
      amounts: data.amounts,
    })),
  };
}

/**
 * Population data for per-capita calculations
 */
export const MUNICIPALITY_POPULATIONS: Record<string, number> = {
  athens: 664_046,
  thessaloniki: 325_182,
  piraeus: 163_688,
  patras: 213_984,
  heraklion: 173_993,
};

/**
 * Calculate per-capita spending
 */
export function calculatePerCapita(amount: number, municipalityId: string): number {
  const population = MUNICIPALITY_POPULATIONS[municipalityId];
  if (!population) return 0;
  return amount / population;
}
