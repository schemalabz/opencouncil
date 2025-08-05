"use client";

import { useState, useCallback, Children } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronRight, ChevronDown } from "lucide-react";

interface ExpandableTableRowProps {
  // Data
  rowId: string | number;
  
  // Selection (optional)
  isSelected?: boolean;
  onSelect?: (checked: boolean) => void;
  
  // Content
  children: React.ReactNode; // TableCell components
  expandedContent: React.ReactNode;
  
  // Styling
  className?: string;
  
  // Accessibility
  ariaLabel?: string;
}

export function ExpandableTableRow({
  rowId,
  isSelected,
  onSelect,
  children,
  expandedContent,
  className,
  ariaLabel
}: ExpandableTableRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(!isExpanded);
  }, [isExpanded]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleExpanded();
    }
  }, [toggleExpanded]);

  const handleCheckboxChange = useCallback((checked: boolean) => {
    onSelect?.(checked);
  }, [onSelect]);

  const hasSelection = onSelect !== undefined;
  const displayLabel = ariaLabel || `Row ${rowId}`;
  
  // Calculate colspan: selection checkbox (1) + expander (1) + children cells
  const childCellCount = Children.count(children);
  const totalColspan = hasSelection ? childCellCount + 2 : childCellCount + 1;

  return (
    <>
      {/* Main Row */}
      <TableRow 
        className={`group hover:bg-muted/50 cursor-pointer ${className || ''}`}
        onClick={toggleExpanded}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-expanded={isExpanded}
        aria-label={`${displayLabel} - ${isExpanded ? 'Collapse' : 'Expand'} details`}
      >
        {/* Selection Checkbox (if enabled) */}
        {hasSelection && (
          <TableCell className="w-12 text-center align-middle" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-center h-full">
              <Checkbox
                checked={isSelected}
                onCheckedChange={handleCheckboxChange}
                aria-label={`Select ${displayLabel}`}
                className="flex-shrink-0"
              />
            </div>
          </TableCell>
        )}

        {/* Expander Cell */}
        <TableCell className="w-12 text-center align-middle">
          <div className="flex items-center justify-center h-full">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded();
              }}
              aria-label={isExpanded ? "Collapse row" : "Expand row"}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 transition-transform" />
              ) : (
                <ChevronRight className="h-4 w-4 transition-transform" />
              )}
            </Button>
          </div>
        </TableCell>

        {/* User-provided cells */}
        {children}
      </TableRow>

      {/* Expanded Content Row */}
      {isExpanded && (
        <TableRow>
          <TableCell 
            colSpan={totalColspan}
            className="p-0"
          >
            <div className="bg-muted/30 border-l-2 border-primary/20 p-4">
              {expandedContent}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
} 