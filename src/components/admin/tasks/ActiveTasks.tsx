'use client';

import { useState, useEffect, useCallback } from 'react';
import { TaskStatus } from '@prisma/client';
import { Loader2 } from 'lucide-react';
import { getActiveTasks, getRecentTasks, deleteTaskStatus } from '@/lib/db/tasks';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import TaskList from '@/components/meetings/admin/TaskList';

const POLL_INTERVAL = 3000;

export function ActiveTasks() {
    const [activeTasks, setActiveTasks] = useState<TaskStatus[]>([]);
    const [recentTasks, setRecentTasks] = useState<TaskStatus[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [loadingActive, setLoadingActive] = useState(true);
    const [loadingRecent, setLoadingRecent] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [recentLoaded, setRecentLoaded] = useState(false);

    const fetchActiveTasks = useCallback(async () => {
        try {
            const tasks = await getActiveTasks();
            setActiveTasks(tasks);
        } catch (error) {
            console.error('Failed to fetch active tasks:', error);
        } finally {
            setLoadingActive(false);
        }
    }, []);

    useEffect(() => {
        fetchActiveTasks();
        const interval = setInterval(fetchActiveTasks, POLL_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchActiveTasks]);

    const fetchRecentTasks = useCallback(async () => {
        setLoadingRecent(true);
        try {
            const result = await getRecentTasks(0);
            setRecentTasks(result.tasks);
            setHasMore(result.hasMore);
        } catch (error) {
            console.error('Failed to fetch recent tasks:', error);
        } finally {
            setLoadingRecent(false);
        }
    }, []);

    const handleLoadMore = async () => {
        setLoadingMore(true);
        try {
            const result = await getRecentTasks(recentTasks.length);
            setRecentTasks(prev => [...prev, ...result.tasks]);
            setHasMore(result.hasMore);
        } catch (error) {
            console.error('Failed to load more tasks:', error);
        } finally {
            setLoadingMore(false);
        }
    };

    const handleTabChange = (tab: string) => {
        if (tab === 'recent' && !recentLoaded) {
            setRecentLoaded(true);
            fetchRecentTasks();
        }
    };

    const handleDelete = async (taskId: string) => {
        await deleteTaskStatus(taskId);
        setActiveTasks(prev => prev.filter(t => t.id !== taskId));
        setRecentTasks(prev => prev.filter(t => t.id !== taskId));
    };

    if (loadingActive) {
        return null;
    }

    return (
        <div className="border rounded-md p-4">
            <Tabs defaultValue="active" local onValueChange={handleTabChange}>
                <TabsList>
                    <TabsTrigger value="active" className="flex items-center gap-2">
                        {activeTasks.length > 0 && <Loader2 className="h-3 w-3 animate-spin" />}
                        Active ({activeTasks.length})
                    </TabsTrigger>
                    <TabsTrigger value="recent">
                        Recent
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="active" className="mt-3">
                    {activeTasks.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">No active tasks</p>
                    ) : (
                        <TaskList
                            tasks={activeTasks}
                            onDelete={handleDelete}
                            isLoading={false}
                            showMeetingInfo
                        />
                    )}
                </TabsContent>

                <TabsContent value="recent" className="mt-3">
                    {loadingRecent ? (
                        <div className="flex justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : recentTasks.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">No recent tasks</p>
                    ) : (
                        <>
                            <TaskList
                                tasks={recentTasks}
                                onDelete={handleDelete}
                                isLoading={false}
                                showMeetingInfo
                            />
                            {hasMore && (
                                <div className="flex justify-center mt-3">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleLoadMore}
                                        disabled={loadingMore}
                                    >
                                        {loadingMore ? (
                                            <>
                                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                Loading...
                                            </>
                                        ) : (
                                            'Load more'
                                        )}
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
