"use client"
import { TaskStatus } from "@prisma/client";
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from "lucide-react";
import { TaskStatusComponent } from "./TaskStatus";
import { useTranslations } from "next-intl";

interface TaskListProps {
    tasks: TaskStatus[];
    onDelete: (taskId: string) => void;
    isLoading: boolean;
}

export default function TaskList({ tasks, onDelete, isLoading }: TaskListProps) {
    const t = useTranslations('admin.taskList');
    
    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (tasks.length === 0) {
        return (
            <div className="text-center text-muted-foreground py-4">
                {t('noTasks')}
            </div>
        );
    }

    return (
        <AnimatePresence>
            {tasks.map((task) => (
                <motion.div
                    key={task.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.1 }}
                >
                    <TaskStatusComponent task={task} onDelete={onDelete} />
                </motion.div>
            ))}
        </AnimatePresence>
    );
}
