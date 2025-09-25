import React, { useState, useEffect } from "react";
import { TaskStatus } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, Trash2, XCircle, HelpCircle, ChevronDown, ChevronUp, Copy, RefreshCw } from "lucide-react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import TimeAgo from "react-timeago";
import { motion, AnimatePresence } from "framer-motion";
import { processTaskResponse } from "@/lib/tasks/tasks";
import { MeetingTaskType } from "@/lib/tasks/types";

const staleTimeMs = 10 * 60 * 1000; // 10 minutes
interface TaskStatusComponentProps {
    task: TaskStatus
    onDelete: (taskId: string) => void
}

export function TaskStatusComponent({ task, onDelete }: TaskStatusComponentProps) {
    const [isStale, setIsStale] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        setIsStale(Date.now() - task.createdAt.getTime() > staleTimeMs);
        const timer = setInterval(() => {
            setIsStale(Date.now() - task.createdAt.getTime() > staleTimeMs);
        }, 60000); // Check every minute
        return () => clearInterval(timer);
    }, [task.createdAt]);

    const getStatusColor = (status: TaskStatus['status']) => {
        switch (status) {
            case 'pending': return 'text-yellow-500'
            case 'succeeded': return 'text-green-500'
            case 'failed': return 'text-red-500'
            default: return 'text-gray-500'
        }
    }

    const StatusIcon = () => {
        switch (task.status) {
            case 'pending':
                return <Loader2 className={`h-3 w-3 animate-spin ${getStatusColor(task.status)}`} />
            case 'succeeded':
                return <CheckCircle2 className={`h-3 w-3 ${getStatusColor(task.status)}`} />
            case 'failed':
                return <XCircle className={`h-3 w-3 ${getStatusColor(task.status)}`} />
            default:
                return <HelpCircle className={`h-3 w-3 ${getStatusColor(task.status)}`} />
        }
    }

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    }

    return (
        <Card className="mb-2 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
            <CardContent className="p-2 flex flex-col">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <StatusIcon />
                        <Badge variant="outline" className="text-xs font-normal">
                            {task.type}
                        </Badge>
                        <span className="text-xs font-medium">{task.status}</span>
                    </div>
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground"><TimeAgo date={task.updatedAt} /></span>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(task.id);
                            }}
                        >
                            {isStale ? (
                                <Trash2 className="h-3 w-3" />
                            ) : (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            )}
                        </Button>
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </div>
                </div>
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3 }}
                            className="mt-2 text-xs text-muted-foreground"
                        >
                            {task.status === 'pending' && (task.stage || task.percentComplete !== null) && (
                                <div className="flex items-center">
                                    <div className="w-1/2 overflow-hidden">
                                        <code className="font-mono truncate block">
                                            {task.stage || ''}
                                        </code>
                                    </div>
                                    <div className="w-1/2 ml-2">
                                        <Progress value={task.percentComplete || 0} className="w-full" />
                                    </div>
                                </div>
                            )}
                            {task.status === 'failed' && task.responseBody && (
                                <div className="flex items-center justify-between">
                                    <code className="font-mono truncate block max-w-[300px]">
                                        {task.responseBody || 'Unknown error'}
                                    </code>
                                    <div className="flex space-x-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-5 w-5 p-0"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                copyToClipboard(task.responseBody || '');
                                            }}
                                        >
                                            <Copy className="h-3 w-3" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-5 w-5 p-0"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                processTaskResponse(task.type as MeetingTaskType, task.id);
                                            }}
                                        >
                                            <RefreshCw className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                            {task.status === 'succeeded' && task.responseBody && (
                                <div className="flex items-center justify-between">
                                    <code className="font-mono truncate block max-w-[300px]">
                                        {task.responseBody}
                                    </code>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 w-5 p-0"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard(task.responseBody || '');
                                        }}
                                    >
                                        <Copy className="h-3 w-3" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-5 w-5 p-0"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            processTaskResponse(task.type as MeetingTaskType, task.id);
                                        }}
                                    >
                                        <RefreshCw className="h-3 w-3" />
                                    </Button>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </CardContent>
        </Card>
    )
}