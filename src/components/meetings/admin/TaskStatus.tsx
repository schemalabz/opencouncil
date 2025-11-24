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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useTranslations } from "next-intl";

const staleTimeMs = 10 * 60 * 1000; // 10 minutes
interface TaskStatusComponentProps {
    task: TaskStatus
    onDelete: (taskId: string) => void
}

export function TaskStatusComponent({ task, onDelete }: TaskStatusComponentProps) {
    const t = useTranslations('admin.taskStatus.reprocessDialog');
    const [isStale, setIsStale] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showReprocessDialog, setShowReprocessDialog] = useState(false);
    const [isReprocessing, setIsReprocessing] = useState(false);
    const [activeReprocessAction, setActiveReprocessAction] = useState<'reprocess' | 'delete' | null>(null);
    const [reprocessError, setReprocessError] = useState<string | null>(null);
    const [reprocessSuccess, setReprocessSuccess] = useState(false);

    useEffect(() => {
        setIsStale(Date.now() - task.createdAt.getTime() > staleTimeMs);
        const timer = setInterval(() => {
            setIsStale(Date.now() - task.createdAt.getTime() > staleTimeMs);
        }, 60000); // Check every minute
        return () => clearInterval(timer);
    }, [task.createdAt]);

    const handleReprocess = async (force: boolean, action: 'reprocess' | 'delete' = 'reprocess') => {
        setIsReprocessing(true);
        setActiveReprocessAction(action);
        setReprocessError(null);
        setReprocessSuccess(false);
        
        try {
            await processTaskResponse(task.type, task.id, { force });
            setReprocessSuccess(true);
        } catch (error) {
            setReprocessError(error instanceof Error ? error.message : t('feedback.error'));
        } finally {
            setIsReprocessing(false);
            setActiveReprocessAction(null);
        }
    };

    const onReprocessClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowReprocessDialog(true);
        setReprocessError(null);
        setReprocessSuccess(false);
    };

    const isTranscribeTask = task.type === 'transcribe';

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
                                    </div>
                                </div>
                            )}
                            {task.status === 'succeeded' && task.responseBody && (
                                <div className="flex items-center justify-between">
                                    <code className="font-mono truncate block max-w-[300px]">
                                        {task.responseBody}
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
                                            onClick={onReprocessClick}
                                        >
                                            <RefreshCw className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </CardContent>
            <Dialog open={showReprocessDialog} onOpenChange={setShowReprocessDialog}>
                <DialogContent onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                    <DialogHeader>
                        <DialogTitle>{t('title', { taskType: task.type })}</DialogTitle>
                        <DialogDescription>
                            <div className="space-y-3">
                                <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                                    {t('explanation')}
                                </div>
                                {isTranscribeTask ? (
                                    <div>
                                        <p>{t('transcribe.description')}</p>
                                        <p className="mt-2 text-orange-600 dark:text-orange-400 font-medium">
                                            {t('transcribe.warning')}
                                        </p>
                                    </div>
                                ) : (
                                    <div>
                                        <p>{t('default.description')}</p>
                                        <p className="mt-2 text-muted-foreground">
                                            {t('default.info')}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </DialogDescription>
                    </DialogHeader>

                    {reprocessSuccess && (
                        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>{t('feedback.success')}</span>
                        </div>
                    )}

                    {reprocessError && (
                        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                            <XCircle className="h-4 w-4" />
                            <span className="text-sm">{reprocessError}</span>
                        </div>
                    )}

                    <DialogFooter className="flex flex-wrap gap-2 sm:justify-end">
                        <Button 
                            variant="outline" 
                            onClick={() => setShowReprocessDialog(false)}
                            disabled={isReprocessing}
                            className="w-full sm:w-auto"
                        >
                            {t('buttons.cancel')}
                        </Button>
                        
                        {isTranscribeTask ? (
                            <>
                                <Button 
                                    variant="secondary" 
                                    onClick={() => handleReprocess(false, 'reprocess')}
                                    disabled={isReprocessing || reprocessSuccess}
                                    className="w-full sm:w-auto whitespace-normal text-center"
                                >
                                    {isReprocessing && activeReprocessAction === 'reprocess' ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            {t('buttons.reprocessing')}
                                        </>
                                    ) : reprocessSuccess ? (
                                        <>
                                            <CheckCircle2 className="h-4 w-4 mr-2" />
                                            {t('buttons.done')}
                                        </>
                                    ) : (
                                        t('buttons.reprocessOnly')
                                    )}
                                </Button>
                                <Button 
                                    variant="destructive" 
                                    onClick={() => handleReprocess(true, 'delete')}
                                    disabled={isReprocessing || reprocessSuccess}
                                    className="w-full sm:w-auto whitespace-normal text-center"
                                >
                                    {isReprocessing && activeReprocessAction === 'delete' ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            {t('buttons.processing')}
                                        </>
                                    ) : reprocessSuccess ? (
                                        <>
                                            <CheckCircle2 className="h-4 w-4 mr-2" />
                                            {t('buttons.done')}
                                        </>
                                    ) : (
                                        t('buttons.deleteAndReprocess')
                                    )}
                                </Button>
                            </>
                        ) : (
                            <Button 
                                onClick={() => handleReprocess(false, 'reprocess')}
                                disabled={isReprocessing || reprocessSuccess}
                                className="w-full sm:w-auto whitespace-normal text-center"
                            >
                                {isReprocessing ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        {t('buttons.reprocessing')}
                                    </>
                                ) : reprocessSuccess ? (
                                    <>
                                        <CheckCircle2 className="h-4 w-4 mr-2" />
                                        {t('buttons.done')}
                                    </>
                                ) : (
                                    t('buttons.reprocess')
                                )}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    )
}