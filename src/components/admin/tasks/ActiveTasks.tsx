'use client';

import { useState, useEffect, useCallback } from 'react';
import { TaskStatus } from '@prisma/client';
import { Loader2 } from 'lucide-react';
import { getActiveTasks } from '@/lib/db/tasks';
import { deleteTaskStatus } from '@/lib/db/tasks';
import TaskList from '@/components/meetings/admin/TaskList';

const POLL_INTERVAL = 3000;

export function ActiveTasks() {
    const [tasks, setTasks] = useState<TaskStatus[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchTasks = useCallback(async () => {
        try {
            const activeTasks = await getActiveTasks();
            setTasks(activeTasks);
        } catch (error) {
            console.error('Failed to fetch active tasks:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTasks();
        const interval = setInterval(fetchTasks, POLL_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchTasks]);

    const handleDelete = async (taskId: string) => {
        await deleteTaskStatus(taskId);
        setTasks(prev => prev.filter(t => t.id !== taskId));
    };

    if (loading || tasks.length === 0) {
        return null;
    }

    return (
        <div className="border rounded-md p-4">
            <h2 className="text-base font-semibold flex items-center gap-2 mb-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                Active Tasks ({tasks.length})
            </h2>
            <TaskList
                tasks={tasks}
                onDelete={handleDelete}
                isLoading={false}
                showMeetingInfo
            />
        </div>
    );
}
