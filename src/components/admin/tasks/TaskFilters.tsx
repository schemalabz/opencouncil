"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { useUrlParams } from "@/hooks/useUrlParams";
import { MeetingTaskType, TASK_CONFIG } from "@/lib/tasks/types";

const ALL_TASK_TYPES = Object.keys(TASK_CONFIG) as MeetingTaskType[];

interface TaskFiltersProps {
  dateFrom: string | undefined;
  dateTo: string | undefined;
  cityId: string | undefined;
  taskTypes: MeetingTaskType[];
  versionMin: string | undefined;
  versionMax: string | undefined;
  availableCities: { id: string; name: string; name_en: string }[];
}

export function TaskFilters({
  dateFrom,
  dateTo,
  cityId,
  taskTypes,
  versionMin,
  versionMax,
  availableCities,
}: TaskFiltersProps) {
  const { updateParam, isPending } = useUrlParams();

  const handleCityChange = (value: string) => {
    updateParam("cityId", value === "all-cities" ? null : value);
  };

  const handleTaskTypesChange = (value: string) => {
    updateParam("taskTypes", value === "default" ? null : value);
  };

  const taskTypesValue = taskTypes.join(",");

  const taskTypeOptions = [
    { value: "default", label: "Core (transcribe, agenda, summarize)" },
    { value: "transcribe", label: "Transcribe only" },
    { value: "processAgenda", label: "Process Agenda only" },
    { value: "summarize", label: "Summarize only" },
    { value: ALL_TASK_TYPES.join(","), label: "All task types" },
  ];

  const matchingOption = taskTypeOptions.find(
    o => o.value === taskTypesValue || (o.value === "default" && taskTypesValue === "transcribe,processAgenda,summarize")
  );
  const selectTaskTypesValue = matchingOption ? matchingOption.value : taskTypesValue;

  return (
    <>
      <div className="w-full md:w-44">
        <Label htmlFor="dateFrom-filter" className="text-sm font-medium mb-2 block">
          From
        </Label>
        <Input
          id="dateFrom-filter"
          type="date"
          defaultValue={dateFrom ?? ""}
          disabled={isPending}
          onChange={(e) => {
            // "all" signals no lower bound (overrides the Jan 1 default)
            updateParam("dateFrom", e.target.value || "all");
          }}
        />
      </div>

      <div className="w-full md:w-44">
        <Label htmlFor="dateTo-filter" className="text-sm font-medium mb-2 block">
          To
        </Label>
        <Input
          id="dateTo-filter"
          type="date"
          defaultValue={dateTo ?? ""}
          disabled={isPending}
          onChange={(e) => {
            updateParam("dateTo", e.target.value || null);
          }}
        />
      </div>

      <div className="w-full md:w-56">
        <Label htmlFor="city-filter" className="text-sm font-medium mb-2 block">
          City
        </Label>
        <Select value={cityId || "all-cities"} onValueChange={handleCityChange} disabled={isPending}>
          <SelectTrigger id="city-filter" disabled={isPending}>
            <SelectValue placeholder="All cities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all-cities">All cities</SelectItem>
            {availableCities.map(city => (
              <SelectItem key={city.id} value={city.id}>
                {city.name_en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-full md:w-72">
        <Label htmlFor="taskTypes-filter" className="text-sm font-medium mb-2 block">
          Task Types
        </Label>
        <Select value={selectTaskTypesValue} onValueChange={handleTaskTypesChange} disabled={isPending}>
          <SelectTrigger id="taskTypes-filter" disabled={isPending}>
            <SelectValue placeholder="Select task types" />
          </SelectTrigger>
          <SelectContent>
            {taskTypeOptions.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-full md:w-28">
        <Label htmlFor="versionMin-filter" className="text-sm font-medium mb-2 block">
          Version Min
        </Label>
        <Input
          id="versionMin-filter"
          type="number"
          placeholder="Min"
          defaultValue={versionMin ?? ""}
          disabled={isPending}
          onBlur={(e) => {
            updateParam("versionMin", e.target.value.trim() || null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </div>

      <div className="w-full md:w-28">
        <Label htmlFor="versionMax-filter" className="text-sm font-medium mb-2 block">
          Version Max
        </Label>
        <Input
          id="versionMax-filter"
          type="number"
          placeholder="Max"
          defaultValue={versionMax ?? ""}
          disabled={isPending}
          onBlur={(e) => {
            updateParam("versionMax", e.target.value.trim() || null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </div>

      {isPending && (
        <div className="flex items-end pb-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading...</span>
          </div>
        </div>
      )}
    </>
  );
}
