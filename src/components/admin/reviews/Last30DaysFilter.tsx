"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useUrlParams } from "@/hooks/useUrlParams";

interface Last30DaysFilterProps {
  last30Days: boolean;
}

export function Last30DaysFilter({ last30Days }: Last30DaysFilterProps) {
  const { updateParam, isPending } = useUrlParams();

  const handleChange = (checked: boolean) => {
    updateParam('last30Days', checked ? 'true' : 'false');
  };

  return (
    <div className="mb-6 p-4 bg-muted/50 rounded-lg border">
      <div className="flex items-center space-x-3">
        <Checkbox
          id="last30Days-top"
          checked={last30Days}
          onCheckedChange={handleChange}
          disabled={isPending}
          className="h-5 w-5"
        />
        <Label
          htmlFor="last30Days-top"
          className="text-base font-semibold cursor-pointer select-none"
        >
          Show only last 30 days
        </Label>
        {isPending && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      <p className="text-sm text-muted-foreground mt-2 ml-8">
        This filter affects all metrics and the meeting list below
      </p>
    </div>
  );
}

