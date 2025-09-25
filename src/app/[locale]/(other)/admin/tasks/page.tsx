import { getHighestVersionsForTasks, getTaskVersionsGroupedByCity } from "@/lib/tasks/tasks";
import TaskVersionsTable from "@/components/admin/tasks/TaskVersionsTable";
import { MeetingTaskType } from "@/lib/tasks/types";

const MEETING_TASKS: MeetingTaskType[] = ['transcribe', 'processAgenda', 'summarize'];

export default async function TasksPage() {
    // Fetch the highest versions for each task type
    const highestVersions = await getHighestVersionsForTasks(MEETING_TASKS);

    // Fetch task versions grouped by city
    const citiesData = await getTaskVersionsGroupedByCity(MEETING_TASKS);

    return (
        <div className="container mx-auto py-8 px-4">
            <h1 className="text-2xl font-bold mb-8">Task Versions Admin</h1>
            <TaskVersionsTable
                highestVersions={highestVersions}
                citiesData={citiesData}
                taskTypes={MEETING_TASKS}
            />
        </div>
    );
}