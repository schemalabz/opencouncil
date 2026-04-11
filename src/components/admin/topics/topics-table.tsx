"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { PlusIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { TopicDialog } from "./topic-dialog";
import { TopicWithSubjectCount } from "@/lib/db/topics";
import Icon from "@/components/icon";
import { Badge } from "@/components/ui/badge";

interface TopicsTableProps {
    initialTopics: TopicWithSubjectCount[];
}

export function TopicsTable({ initialTopics: topics }: TopicsTableProps) {
    const router = useRouter();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedTopic, setSelectedTopic] = useState<TopicWithSubjectCount | undefined>();
    const [topicToDelete, setTopicToDelete] = useState<TopicWithSubjectCount | null>(null);
    const [deleting, setDeleting] = useState(false);

    function onCreate() {
        setSelectedTopic(undefined);
        setDialogOpen(true);
    }

    function onEdit(topic: TopicWithSubjectCount) {
        setSelectedTopic(topic);
        setDialogOpen(true);
    }

    async function handleConfirmDelete() {
        if (!topicToDelete) return;
        setDeleting(true);
        try {
            const response = await fetch(`/api/admin/topics/${topicToDelete.id}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.error || "Failed to delete topic");
            }

            toast({
                title: "Success",
                description: `Topic "${topicToDelete.name}" has been deleted.`,
            });
            setTopicToDelete(null);
            router.refresh();
        } catch (error) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to delete topic",
                variant: "destructive",
            });
        } finally {
            setDeleting(false);
        }
    }

    return (
        <TooltipProvider>
            <div className="p-6 space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold">Topics</h1>
                        <p className="text-sm text-muted-foreground">
                            Topic categories used to classify subjects. Descriptions are passed to the LLM during
                            agenda processing and summarization.
                        </p>
                    </div>
                    <Button onClick={onCreate}>
                        <PlusIcon className="mr-2 h-4 w-4" />
                        Create topic
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>All topics ({topics.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-20">Symbol</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Name (EN)</TableHead>
                                    <TableHead className="w-24 text-right">Subjects</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="w-32 text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {topics.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                            No topics yet. Create one to get started.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    topics.map((topic) => {
                                        const subjectCount = topic._count.subjects;
                                        const canDelete = subjectCount === 0;
                                        return (
                                            <TableRow
                                                key={topic.id}
                                                className={topic.deprecated ? "bg-amber-50 dark:bg-amber-950/30" : undefined}
                                            >
                                                <TableCell>
                                                    <div
                                                        className="flex h-9 w-9 items-center justify-center rounded-full border border-border"
                                                        style={{ backgroundColor: topic.colorHex }}
                                                        title={topic.colorHex}
                                                    >
                                                        {topic.icon && (
                                                            <Icon name={topic.icon} color="#ffffff" size={18} />
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-medium">
                                                    <div className="flex items-center gap-2">
                                                        <span className={topic.deprecated ? "line-through text-muted-foreground" : undefined}>
                                                            {topic.name}
                                                        </span>
                                                        {topic.deprecated && (
                                                            <Badge variant="destructive" className="uppercase tracking-wide">
                                                                Deprecated
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>{topic.name_en}</TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {subjectCount}
                                                </TableCell>
                                                <TableCell className="max-w-[400px]">
                                                    <span
                                                        className="line-clamp-2 text-sm text-muted-foreground"
                                                        title={topic.description}
                                                    >
                                                        {topic.description || (
                                                            <span className="italic">No description</span>
                                                        )}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => onEdit(topic)}
                                                            aria-label="Edit topic"
                                                        >
                                                            <PencilIcon className="h-4 w-4" />
                                                        </Button>
                                                        {canDelete ? (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => setTopicToDelete(topic)}
                                                                aria-label="Delete topic"
                                                            >
                                                                <Trash2Icon className="h-4 w-4" />
                                                            </Button>
                                                        ) : (
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <span>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            disabled
                                                                            aria-label="Delete topic (disabled)"
                                                                        >
                                                                            <Trash2Icon className="h-4 w-4" />
                                                                        </Button>
                                                                    </span>
                                                                </TooltipTrigger>
                                                                <TooltipContent>
                                                                    Cannot delete: {subjectCount} subject
                                                                    {subjectCount === 1 ? "" : "s"} still
                                                                    assigned to this topic.
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <TopicDialog
                    open={dialogOpen}
                    onOpenChange={setDialogOpen}
                    topic={selectedTopic}
                    existingColors={topics
                        .filter((t) => t.id !== selectedTopic?.id)
                        .map((t) => t.colorHex)}
                    onSaved={() => router.refresh()}
                />

                <Dialog open={!!topicToDelete} onOpenChange={(open) => !open && setTopicToDelete(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Delete topic</DialogTitle>
                            <DialogDescription>
                                This will permanently delete the topic{" "}
                                <span className="font-semibold">{topicToDelete?.name}</span>. This cannot be
                                undone.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button variant="outline" disabled={deleting}>
                                    Cancel
                                </Button>
                            </DialogClose>
                            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
                                {deleting ? "Deleting..." : "Delete topic"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </TooltipProvider>
    );
}
