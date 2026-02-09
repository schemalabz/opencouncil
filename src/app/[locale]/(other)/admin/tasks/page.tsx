import { getHighestVersionsForTasks, getTaskVersionsGroupedByCity, getAvailableCities } from "@/lib/tasks/tasks";
import type { TaskVersionsFilter } from "@/lib/tasks/tasks";
import TaskVersionsTable from "@/components/admin/tasks/TaskVersionsTable";
import { TaskFilters } from "@/components/admin/tasks/TaskFilters";
import { MeetingTaskType } from "@/lib/tasks/types";

const DEFAULT_TASK_TYPES: MeetingTaskType[] = ['transcribe', 'processAgenda', 'summarize'];

interface PageProps {
    searchParams: {
        dateFrom?: string;
        dateTo?: string;
        cityId?: string;
        taskTypes?: string;
        versionMin?: string;
        versionMax?: string;
    };
}

export default async function TasksPage({ searchParams }: PageProps) {
    // Parse date range — default dateFrom is Jan 1 of current year, "all" = no filter
    const currentYear = new Date().getFullYear();
    const defaultDateFrom = `${currentYear}-01-01`;
    const dateFromParam = searchParams.dateFrom === "all" ? "" : (searchParams.dateFrom ?? defaultDateFrom);
    const dateFrom = dateFromParam ? new Date(dateFromParam) : undefined;
    const dateTo = searchParams.dateTo ? new Date(searchParams.dateTo + "T23:59:59.999Z") : undefined;

    // Parse city filter
    const cityIds = searchParams.cityId ? [searchParams.cityId] : undefined;

    // Parse task types
    const taskTypes: MeetingTaskType[] = searchParams.taskTypes
        ? searchParams.taskTypes.split(",") as MeetingTaskType[]
        : DEFAULT_TASK_TYPES;

    // Parse version range
    const versionMin = searchParams.versionMin ? parseInt(searchParams.versionMin, 10) : undefined;
    const versionMax = searchParams.versionMax ? parseInt(searchParams.versionMax, 10) : undefined;

    const filters: TaskVersionsFilter = {
        taskTypes,
        dateFrom,
        dateTo,
        cityIds,
        versionMin,
        versionMax,
    };

    // Fetch data and metadata in parallel
    const [highestVersions, citiesData, availableCities] = await Promise.all([
        getHighestVersionsForTasks(taskTypes),
        getTaskVersionsGroupedByCity(filters),
        getAvailableCities(),
    ]);

    return (
        <div className="container mx-auto py-8 px-4">
            <h1 className="text-2xl font-bold mb-6">Task Versions Admin</h1>

            <div className="flex flex-col md:flex-row flex-wrap gap-4 mb-6">
                <TaskFilters
                    dateFrom={dateFromParam}
                    dateTo={searchParams.dateTo}
                    cityId={searchParams.cityId}
                    taskTypes={taskTypes}
                    versionMin={searchParams.versionMin}
                    versionMax={searchParams.versionMax}
                    availableCities={availableCities}
                />
            </div>

            <TaskVersionsTable
                highestVersions={highestVersions}
                citiesData={citiesData}
                taskTypes={taskTypes}
            />
        </div>
    );
}
