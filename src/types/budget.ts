/**
 * Type definitions for Municipal Budget and Technical Program data
 * 
 * These types represent the structured data extracted from Greek municipal
 * budget (προϋπολογισμός) and technical program (τεχνικό πρόγραμμα) PDFs.
 */

/**
 * Budget category codes following the Greek municipal accounting system (KAE codes)
 */
export type BudgetCategoryCode = string; // e.g., "00", "10", "15", "20", "60", "70"

/**
 * Type of budget document
 */
export type BudgetType = 'initial' | 'revised' | 'actual';

/**
 * Main budget category (top level)
 */
export interface BudgetCategory {
  id: string;
  code: BudgetCategoryCode;
  name: string;
  name_en: string;
  amount: number;
  subcategories?: BudgetCategory[];
  parentId?: string;
}

/**
 * Complete municipal budget for a specific year
 */
export interface MunicipalBudget {
  id: string;
  municipalityId: string;
  municipalityName: string;
  municipalityName_en: string;
  year: number;
  type: BudgetType;
  totalRevenue: number;
  totalExpenditure: number;
  categories: BudgetCategory[];
  uploadDate: Date;
  sourceUrl?: string;
}

/**
 * Infrastructure project from technical program
 */
export interface InfrastructureProject {
  id: string;
  title: string;
  title_en: string;
  description?: string;
  budget: number;
  category: string;
  category_en: string;
  status?: 'planned' | 'in-progress' | 'completed' | 'cancelled';
  location?: {
    address?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
}

/**
 * Technical program for a municipality and year
 */
export interface TechnicalProgram {
  id: string;
  municipalityId: string;
  municipalityName: string;
  municipalityName_en: string;
  year: number;
  projects: InfrastructureProject[];
  totalBudget: number;
  sourceUrl?: string;
}

/**
 * Budget comparison data for visualizations
 */
export interface BudgetComparison {
  municipalities: Array<{
    id: string;
    name: string;
    name_en: string;
    population?: number;
  }>;
  year: number;
  categories: Array<{
    code: BudgetCategoryCode;
    name: string;
    name_en: string;
    amounts: Record<string, number>; // municipalityId -> amount
  }>;
}

/**
 * Time series data for budget trends
 */
export interface BudgetTimeSeries {
  municipalityId: string;
  municipalityName: string;
  municipalityName_en: string;
  years: number[];
  data: Array<{
    year: number;
    totalRevenue: number;
    totalExpenditure: number;
    categories: Record<BudgetCategoryCode, number>;
  }>;
}
