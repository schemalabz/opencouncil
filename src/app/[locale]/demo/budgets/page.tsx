import { BudgetComparison } from "@/components/budgets/BudgetComparison";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Budget Comparison | OpenCouncil",
  description: "Interactive comparison of Greek municipal budgets",
};
export default function BudgetDemoPage() {
  return (
    <div className="container py-8">
      <BudgetComparison />
    </div>
  );
}
